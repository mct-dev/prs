import { type FilterExpr, parseWhereExpression } from "../filter/parse.js"
import { DEFAULT_SECTION_LIMIT, MAX_SECTION_LIMIT, type SectionConfig, type SectionSort, type SectionsConfig, type SectionVarValue } from "./config.js"

// Pure compilation of `sections.yaml` into GitHub search strings.
//
// - Every query gets `is:pr is:open archived:false`.
// - `{me}` is the viewer login; list vars expand to repeated qualifiers (the
//   leading `-` repeats too, so `-author:{bots}` negates every bot).
// - `exclude:` is negated onto EVERY `any:` branch.
// - `team-authors:org/team` expands to `author:` terms from the member list,
//   chunked across several queries when the list is long.
// - GitHub silently returns nothing for over-limit queries, so the limits
//   (256 chars of free text, 5 AND/OR/NOT operators) are checked here.

export const BASE_QUALIFIERS = ["is:pr", "is:open", "archived:false"] as const
export const MAX_FREE_TEXT_LENGTH = 256
export const MAX_BOOLEAN_OPERATORS = 5
export const AUTHOR_CHUNK_SIZE = 40

export interface CompileContext {
	readonly viewer: string
	/** Resolved vars; `my_teams` should already be filled in by the loader. */
	readonly vars: Readonly<Record<string, SectionVarValue>>
	/** Members per `org/team`, lowercased key. Missing teams compile to an error. */
	readonly teamMembers: ReadonlyMap<string, readonly string[]>
}

export interface CompiledSection {
	readonly id: string
	readonly title: string
	readonly queries: readonly string[]
	readonly where: FilterExpr | null
	readonly sort: SectionSort
	readonly limit: number
	readonly collapsed: boolean
	readonly exclusive: boolean
	/** Compile-time problem; the section renders with this error and no fetch. */
	readonly error: string | null
	/** Stable cache key: id plus a hash of the compiled queries. */
	readonly key: string
}

class CompileError extends Error {}

const varPattern = /\{([a-z_][a-z0-9_]*)\}/gi

const splitTokens = (query: string) => query.split(/\s+/).filter((token) => token.length > 0)

/** Expand `{var}` references inside one token. List vars repeat the whole token. */
export const expandToken = (token: string, vars: Readonly<Record<string, SectionVarValue>>): readonly string[] => {
	const names = [...token.matchAll(varPattern)].map((match) => match[1]!)
	if (names.length === 0) return [token]
	let results: string[] = [token]
	for (const name of new Set(names)) {
		const value = vars[name]
		if (value === undefined) throw new CompileError(`unknown variable {${name}}`)
		const values = typeof value === "string" ? [value] : value
		if (values.length === 0) {
			if (token.startsWith("-")) return []
			throw new CompileError(`variable {${name}} is empty`)
		}
		results = results.flatMap((current) => values.map((item) => current.replaceAll(`{${name}}`, item)))
	}
	return results
}

export const expandQuery = (query: string, vars: Readonly<Record<string, SectionVarValue>>): readonly string[] => splitTokens(query).flatMap((token) => expandToken(token, vars))

const negate = (token: string) => (token.startsWith("-") ? token.slice(1) : `-${token}`)

const isQualifier = (token: string) => /^-?[a-z][a-z-]*:/i.test(token)
const isBooleanOperator = (token: string) => token === "AND" || token === "OR" || token === "NOT"

/** Check GitHub's search limits; returns a message when violated. */
export const checkSearchLimits = (query: string): string | null => {
	const tokens = splitTokens(query)
	const operators = tokens.filter(isBooleanOperator).length
	if (operators > MAX_BOOLEAN_OPERATORS) return `query uses ${operators} AND/OR/NOT operators (GitHub allows ${MAX_BOOLEAN_OPERATORS})`
	const freeText = tokens.filter((token) => !isQualifier(token) && !isBooleanOperator(token)).join(" ")
	if (freeText.length > MAX_FREE_TEXT_LENGTH) return `query has ${freeText.length} characters of free text (GitHub allows ${MAX_FREE_TEXT_LENGTH})`
	return null
}

const chunk = <A>(items: readonly A[], size: number): readonly (readonly A[])[] => {
	const chunks: A[][] = []
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
	return chunks
}

const teamAuthorsPattern = /^(-?)team-authors:(.+)$/i

/** Team slugs (`org/team`) referenced after var expansion, for prefetching members. */
export const referencedTeams = (config: SectionsConfig, vars: Readonly<Record<string, SectionVarValue>>): readonly string[] => {
	const teams = new Set<string>()
	for (const section of config.sections) {
		for (const query of [section.query, section.exclude, ...(section.any ?? [])]) {
			if (query === undefined) continue
			for (const token of splitTokens(query)) {
				let expanded: readonly string[]
				try {
					expanded = expandToken(token, vars)
				} catch {
					continue
				}
				for (const item of expanded) {
					const match = teamAuthorsPattern.exec(item)
					if (match) teams.add(match[2]!.toLowerCase())
				}
			}
		}
	}
	return [...teams]
}

// Dedupe repeated qualifiers only; free text and AND/OR/NOT keep their positions.
const uniqueCaseInsensitive = (items: readonly string[]) => {
	const seen = new Set<string>()
	return items.filter((item) => {
		if (!isQualifier(item)) return true
		const key = item.toLowerCase()
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

const compileBranch = (branch: string, exclude: readonly string[], context: CompileContext): readonly string[] => {
	const tokens = [...expandQuery(branch, context.vars), ...exclude]
	const plain: string[] = []
	const teamAuthors: string[] = []
	for (const token of tokens) {
		const match = teamAuthorsPattern.exec(token)
		if (!match) {
			plain.push(token)
			continue
		}
		const team = match[2]!.toLowerCase()
		const members = context.teamMembers.get(team)
		if (members === undefined) throw new CompileError(`team ${match[2]} could not be loaded`)
		if (match[1] === "-") plain.push(...members.map((member) => `-author:${member}`))
		else {
			if (members.length === 0) throw new CompileError(`team ${match[2]} has no members`)
			teamAuthors.push(...members)
		}
	}
	const base = uniqueCaseInsensitive([...BASE_QUALIFIERS, ...plain])
	const authors = [...new Map(teamAuthors.map((author) => [author.toLowerCase(), author])).values()]
	const queries = authors.length === 0 ? [base.join(" ")] : chunk(authors, AUTHOR_CHUNK_SIZE).map((group) => [...base, ...group.map((author) => `author:${author}`)].join(" "))
	for (const query of queries) {
		const violation = checkSearchLimits(query)
		if (violation) throw new CompileError(violation)
	}
	return queries
}

// FNV-1a, enough to key cached section snapshots by their compiled queries.
const hashString = (value: string) => {
	let hash = 0x811c9dc5
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}

const clampLimit = (limit: number | undefined) => {
	if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_SECTION_LIMIT
	return Math.max(1, Math.min(MAX_SECTION_LIMIT, Math.floor(limit)))
}

export const compileSection = (section: SectionConfig, context: CompileContext): CompiledSection => {
	const common = {
		id: section.id,
		title: section.title,
		sort: section.sort ?? "-updated",
		limit: clampLimit(section.limit),
		collapsed: section.collapsed ?? false,
		exclusive: section.exclusive ?? true,
	} as const
	const failed = (message: string): CompiledSection => ({ ...common, queries: [], where: null, error: message, key: `${section.id}:error` })
	try {
		const vars = { ...context.vars, me: context.viewer }
		const scoped = { ...context, vars }
		const where = section.where === undefined || section.where.trim().length === 0 ? null : parseWhereExpression(section.where)
		const exclude = section.exclude === undefined ? [] : expandQuery(section.exclude, vars).map(negate)
		const branches = section.any && section.any.length > 0 ? section.any.map((branch) => (section.query ? `${section.query} ${branch}` : branch)) : [section.query ?? ""]
		const queries = [...new Set(branches.flatMap((branch) => compileBranch(branch, exclude, scoped)))]
		return { ...common, queries, where, error: null, key: `${section.id}:${hashString(queries.join("\n"))}` }
	} catch (error) {
		return failed(error instanceof Error ? error.message : String(error))
	}
}

export const compileSections = (config: SectionsConfig, context: CompileContext): readonly CompiledSection[] => config.sections.map((section) => compileSection(section, context))
