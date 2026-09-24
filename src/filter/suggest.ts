// Autocomplete for the `/` filter prompt. Pure: the popover feeds it the draft,
// the loaded PRs, recent filters and section ids, and renders what comes back.
//
// The draft has no cursor (typing only appends), so the "current token" is
// whatever follows the last whitespace. Accepting a suggestion replaces that
// token; values end with a space so the next token can start right away.

import type { PullRequestItem } from "../domain.js"
import { isValidFilterValue } from "./evaluate.js"
import { type FilterField, filterFields } from "./parse.js"

export type FilterSuggestionKind = "field" | "value" | "recent"

export interface FilterSuggestion {
	readonly kind: FilterSuggestionKind
	/** What the row shows, e.g. `author:` or `alice`. */
	readonly label: string
	/** The full draft after accepting. */
	readonly insert: string
	readonly description: string
	/** How many loaded PRs carry this value (author/repo/label). */
	readonly count?: number
}

export interface FilterSuggestInput {
	readonly draft: string
	readonly pullRequests: readonly PullRequestItem[]
	readonly recent?: readonly string[]
	readonly sectionIds?: readonly string[]
	readonly limit?: number
}

export interface FilterSuggestions {
	readonly token: string
	readonly items: readonly FilterSuggestion[]
}

export const fieldDescriptions: Record<FilterField, string> = {
	author: "PR author (@me for you)",
	repo: "owner/name, or part of it",
	label: "has this label",
	draft: "draft or ready",
	size: "lines changed (size>400)",
	files: "files changed (files>20)",
	file: "touches a path glob (file:*.sql)",
	age: "time since opened (age>3d)",
	idle: "time since last update (idle>1w)",
	ci: "checks: pass, fail, pending, none",
	review: "approved, changes, required, none, draft",
	risk: "brief risk: low, medium, high",
	brief: "brief state: none, stale, running, done",
	section: "in a sections-view section",
	"me.reviewed": "you have reviewed it",
	"me.reviewed_since_push": "you reviewed the latest push",
}

const numericFields: ReadonlySet<FilterField> = new Set(["size", "files", "age", "idle"])
const bareFields: ReadonlySet<FilterField> = new Set(["me.reviewed", "me.reviewed_since_push"])

const enumValues: Partial<Record<FilterField, readonly (readonly [string, string])[]>> = {
	draft: [
		["true", "drafts only"],
		["false", "ready for review"],
	],
	ci: [
		["pass", "all checks green"],
		["fail", "a check failed"],
		["pending", "checks still running"],
		["none", "no checks"],
	],
	review: [
		["approved", "approved"],
		["changes", "changes requested"],
		["required", "review required"],
		["none", "no review yet"],
		["draft", "draft"],
	],
	risk: [
		["low", "low risk"],
		["medium", "medium risk"],
		["high", "high risk"],
	],
	brief: [
		["none", "no brief yet"],
		["stale", "brief is behind the head commit"],
		["running", "brief being written"],
		["done", "brief ready"],
	],
	"me.reviewed": [
		["true", "you reviewed it"],
		["false", "you haven't reviewed it"],
	],
	"me.reviewed_since_push": [
		["true", "reviewed the latest push"],
		["false", "new commits since your review"],
	],
}

// Operator + value examples for numeric fields.
const numericExamples: Partial<Record<FilterField, readonly (readonly [string, string])[]>> = {
	size: [
		[">400", "more than 400 lines"],
		["<50", "under 50 lines"],
		[">=1k", "1000+ lines"],
	],
	files: [
		[">20", "more than 20 files"],
		["<5", "under 5 files"],
	],
	age: [
		[">3d", "opened over 3 days ago"],
		["<1d", "opened today"],
		[">=1w", "a week or older"],
		["<=2h", "last 2 hours"],
	],
	idle: [
		[">3d", "no updates for 3+ days"],
		["<1d", "updated today"],
		[">=1w", "quiet for a week"],
		["<=2h", "updated in the last 2 hours"],
	],
}

/** The token being typed: text after the last whitespace ("" right after a space). */
export const currentFilterToken = (draft: string): string => {
	const match = /(\S*)$/.exec(draft)
	return match?.[1] ?? ""
}

const operatorFor = (field: FilterField) => (numericFields.has(field) ? ">" : bareFields.has(field) ? " " : ":")

const byFrequency = (values: Iterable<string>): readonly (readonly [string, number])[] => {
	const counts = new Map<string, number>()
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const valuesFromPullRequests = (field: FilterField, pullRequests: readonly PullRequestItem[]): readonly (readonly [string, number])[] => {
	switch (field) {
		case "author":
			return byFrequency(pullRequests.map((pullRequest) => pullRequest.author))
		case "repo":
			return byFrequency(pullRequests.map((pullRequest) => pullRequest.repository))
		case "label":
			return byFrequency(pullRequests.flatMap((pullRequest) => pullRequest.labels.map((label) => label.name)))
		default:
			return []
	}
}

const quoteIfNeeded = (value: string) => (/\s/.test(value) ? `"${value}"` : value)

const fieldSuggestions = (prefix: string, negation: string, typed: string): FilterSuggestion[] =>
	filterFields
		.filter((field) => field.startsWith(typed))
		.map((field) => {
			const op = operatorFor(field)
			const label = `${negation}${field}${op === " " ? "" : op}`
			return { kind: "field", label, insert: `${prefix}${negation}${field}${op}`, description: fieldDescriptions[field] }
		})

const valueSuggestions = (prefix: string, negation: string, field: FilterField, op: string, typed: string, input: FilterSuggestInput): FilterSuggestion[] => {
	const lead = `${prefix}${negation}${field}`
	const examples = numericExamples[field]
	if (examples) {
		const typedTail = `${op}${typed}`
		return examples
			.filter(([example]) => (op === ":" && typed.length === 0) || example.startsWith(typedTail))
			.map(([example, description]) => ({ kind: "value", label: `${field}${example}`, insert: `${lead}${example} `, description }))
	}
	if (op !== ":") return []
	const lowered = typed.toLowerCase()
	const matches = (value: string) => value.toLowerCase().startsWith(lowered.replace(/^"/, ""))
	const enumerated = enumValues[field]
	if (enumerated) {
		return enumerated.filter(([value]) => matches(value)).map(([value, description]) => ({ kind: "value", label: value, insert: `${lead}:${value} `, description }))
	}
	if (field === "section") {
		return (input.sectionIds ?? []).filter(matches).map((id) => ({ kind: "value", label: id, insert: `${lead}:${id} `, description: "section id" }))
	}
	const fromPullRequests = valuesFromPullRequests(field, input.pullRequests)
		.filter(([value]) => matches(value))
		.map(([value, count]): FilterSuggestion => ({ kind: "value", label: value, insert: `${lead}:${quoteIfNeeded(value)} `, description: "", count }))
	if (field === "author" && matches("@me")) {
		return [{ kind: "value", label: "@me", insert: `${lead}:@me `, description: "you" }, ...fromPullRequests]
	}
	return fromPullRequests
}

const valueTokenPattern = /^(-?)([a-z][a-z._]*)(>=|<=|:|>|<)(.*)$/i

export const suggestFilter = (input: FilterSuggestInput): FilterSuggestions => {
	const limit = input.limit ?? 8
	const { draft } = input
	const token = currentFilterToken(draft)
	const prefix = draft.slice(0, draft.length - token.length)

	if (draft.length === 0) {
		const recent = (input.recent ?? []).map((query): FilterSuggestion => ({ kind: "recent", label: query, insert: query, description: "recent" }))
		return { token, items: [...recent, ...fieldSuggestions("", "", "")].slice(0, limit) }
	}
	if (token.length === 0) return { token, items: [] }

	const valueMatch = valueTokenPattern.exec(token)
	if (valueMatch) {
		const field = valueMatch[2]!.toLowerCase()
		if (!(filterFields as readonly string[]).includes(field)) return { token, items: [] }
		const items = valueSuggestions(prefix, valueMatch[1]!, field as FilterField, valueMatch[3]!, valueMatch[4]!, input)
		// Don't offer exactly what's already typed as the only choice.
		const useful = items.length === 1 && items[0]!.insert.trimEnd() === draft ? [] : items
		return { token, items: useful.slice(0, limit) }
	}

	const bare = /^(-?)([a-z][a-z._]*)$/i.exec(token)
	if (!bare) return { token, items: [] }
	return { token, items: fieldSuggestions(prefix, bare[1]!, bare[2]!.toLowerCase()).slice(0, limit) }
}

const enumHint = (field: FilterField) => {
	const values = enumValues[field]
	if (values) return `try ${values.map(([value]) => value).join(", ")}`
	if (field === "age" || field === "idle") return "try 3d, 2h, 1w"
	if (field === "size" || field === "files") return "try a number like 400"
	return ""
}

export interface FilterDiagnosticsOptions {
	/** Known section ids; when given, `section:` values are checked against them. */
	readonly sectionIds?: readonly string[]
	/** Skip the last token (it's still being typed). */
	readonly skipCurrent?: boolean
}

/** Soft warnings for the draft: unknown fields and values no PR can match. */
export const filterDiagnostics = (draft: string, options: FilterDiagnosticsOptions = {}): readonly string[] => {
	const tokens = draft.split(/\s+/).filter((token) => token.length > 0)
	if (options.skipCurrent && !/\s$/.test(draft)) tokens.pop()
	const warnings: string[] = []
	for (const token of tokens) {
		const match = valueTokenPattern.exec(token)
		if (!match || match[4]!.length === 0) continue
		const field = match[2]!.toLowerCase()
		const value = match[4]!.replace(/^"|"$/g, "")
		if (!(filterFields as readonly string[]).includes(field)) {
			warnings.push(`unknown field "${field}" (searched as text)`)
			continue
		}
		const known = field as FilterField
		if (!isValidFilterValue(known, value)) {
			const hint = enumHint(known)
			warnings.push(`${known}: "${value}" won't match${hint ? `, ${hint}` : ""}`)
		} else if (known === "section" && options.sectionIds && options.sectionIds.length > 0 && !options.sectionIds.includes(value.toLowerCase())) {
			warnings.push(`no section "${value}" (have ${options.sectionIds.join(", ")})`)
		}
	}
	return warnings
}

/** Whether the query filters on `risk` (so PRs without a brief are worth mentioning). */
export const usesRiskFilter = (query: string) => /(^|\s)-?risk(:|>|<)/i.test(query)

/** Unknown risk never hides a PR; say how many are riding along. */
export const riskUnknownNote = (count: number) => `${count} PR${count === 1 ? " has" : "s have"} no brief (shown as unknown)`
