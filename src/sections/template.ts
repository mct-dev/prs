import { mkdir, rename, rm } from "node:fs/promises"
import { dirname } from "node:path"
import { parseSectionsConfig, type SectionVarValue } from "./config.js"

// The starter `sections.yaml` written by "Edit sections config". It must parse
// to exactly `defaultSectionsConfig` (tested), so creating the file changes
// nothing until the user edits it.
export const SECTIONS_TEMPLATE = `# prs sections: each section is a GitHub search, shown in this order.
# Edit and save; prs reloads when your editor exits. Delete this file to go
# back to the built-in defaults.
#
# Queries use GitHub search syntax plus:
#   {me}                 your login
#   {name}               a var below (a list expands to one search per value)
#   team-authors:org/t   PRs by members of a team
# Optional per section:
#   any:       [queries]  match any of these (combined with query:)
#   exclude:   "tokens"   negated onto every branch
#   where:     "expr"     local filter, same fields as the / prompt
#   sort:      updated | -updated | size | -size | age | -age | risk | -risk
#   limit:     max PRs (default 50, up to 500)
#   collapsed: true       start folded
#   exclusive: true       hide these PRs from later sections

vars:
  # Optional. If unset, my_teams = your smallest team from \`gh api user/teams\`
  # (ties included; every team if you have one, or GitHub hides counts).
  # "Choose my teams" in the command palette edits this line for you.
  # my_teams: [my-org/backend]
  bots: ["app/dependabot", "app/renovate", "app/github-actions"]

sections:
  - id: needs-me
    title: Needs my review
    query: "review-requested:{me} -author:{me} draft:false"
    exclude: "author:{bots}"
  - id: rereview
    title: New commits since my review
    query: "reviewed-by:{me} -author:{me}"
    where: "me.reviewed and not me.reviewed_since_push"
  - id: team
    title: My team's work
    query: "team-authors:{my_teams} -author:{me}"
  - id: mine
    title: My PRs
    query: "author:{me}"
  - id: bots
    title: Bots
    any: ["review-requested:{me} author:{bots}"]
    collapsed: true
`

/** Write via a sibling temp file and rename, so a crash never leaves a half-written sections.yaml. */
export const writeFileAtomic = async (path: string, text: string) => {
	await mkdir(dirname(path), { recursive: true })
	const temp = `${path}.${process.pid}.tmp`
	try {
		await Bun.write(temp, text)
		await rename(temp, path)
	} catch (error) {
		await rm(temp, { force: true })
		throw error
	}
}

/** File contents, or null only when it doesn't exist (other read errors throw, so nothing overwrites an unreadable file). */
export const readTextIfExists = async (path: string): Promise<string | null> => {
	try {
		return await Bun.file(path).text()
	} catch (error) {
		if ((error as { code?: unknown } | null)?.code === "ENOENT") return null
		throw error
	}
}

/** Write the template to `path` unless a file is already there. Returns true when it created one. */
export const ensureSectionsConfigFile = async (path: string): Promise<boolean> => {
	const file = Bun.file(path)
	if (await file.exists()) return false
	await writeFileAtomic(path, SECTIONS_TEMPLATE)
	return true
}

/** `vars.my_teams` as written in the file, or null when unset or unparseable. */
export const configuredMyTeams = (text: string): readonly string[] | null => {
	const parsed = parseSectionsConfig(text)
	if (!("config" in parsed)) return null
	const value: SectionVarValue | undefined = parsed.config.vars?.my_teams
	if (value === undefined) return null
	return typeof value === "string" ? [value] : value
}

const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index])

const flowList = (teams: readonly string[]) => `[${teams.map((team) => JSON.stringify(team)).join(", ")}]`

const topLevelKeyName = /^([A-Za-z_][\w-]*)\s*:/
// `vars:` optionally followed by an anchor and/or a comment, nothing else (a flow map is not line-editable).
const varsLine = /^vars\s*:\s*(&\S+\s*)?(#.*)?$/
const myTeamsLine = /^(\s+)(#\s*)?my_teams\s*:(.*)$/
const indentOf = (line: string) => /^\s*/.exec(line)![0].length
const isBlankOrComment = (line: string) => /^\s*(#.*)?$/.test(line)

/** Bracket depth change of a flow-list fragment, ignoring brackets inside quotes and comments. */
const bracketDelta = (text: string) => {
	let depth = 0
	let quote: string | null = null
	for (const char of text) {
		if (quote) {
			if (char === quote) quote = null
		} else if (char === '"' || char === "'") quote = char
		else if (char === "#") break
		else if (char === "[") depth++
		else if (char === "]") depth--
	}
	return depth
}

/** How many lines after a live `my_teams:` line belong to its value (block list or multi-line flow list). */
const valueContinuation = (lines: readonly string[], at: number, indent: number, inline: string): number => {
	const value = inline.replace(/\s+#.*$/, "").trim()
	let count = 0
	if (value.startsWith("[")) {
		let depth = bracketDelta(value)
		while (depth > 0 && at + 1 + count < lines.length) depth += bracketDelta(lines[at + 1 + count++]!)
		return depth > 0 ? -1 : count
	}
	if (value.length > 0) return 0
	// Block list: `- x` items at the key's indent or deeper; blank/comment lines between items go too.
	let last = 0
	while (at + 1 + count < lines.length) {
		const line = lines[at + 1 + count]!
		if (isBlankOrComment(line)) count++
		else if (/^\s*-(\s|$)/.test(line) && indentOf(line) >= indent) last = ++count
		else if (last > 0 && indentOf(line) > indent) last = ++count
		else break
	}
	return last
}

/**
 * Edit only the `my_teams:` line(s) so comments, unknown keys and layout
 * survive. Returns null when the layout isn't one it can edit safely.
 */
const editMyTeamsLines = (lines: readonly string[], teams: readonly string[]): string[] | null => {
	const varsIndex = lines.findIndex((line) => varsLine.test(line))
	const entry = (indent: string) => `${indent}my_teams: ${flowList(teams)}`
	if (varsIndex === -1) {
		if (lines.some((line) => /^vars\s*:/.test(line))) return null
		const sectionsIndex = lines.findIndex((line) => /^sections\s*:/.test(line))
		const at = sectionsIndex === -1 ? 0 : sectionsIndex
		return [...lines.slice(0, at), "vars:", entry("  "), "", ...lines.slice(at)]
	}
	let end = varsIndex + 1
	while (end < lines.length && !topLevelKeyName.test(lines[end]!)) end++
	const block = lines.slice(varsIndex + 1, end)
	// Prefer a live line over a commented example.
	const live = block.findIndex((line) => myTeamsLine.test(line) && !myTeamsLine.exec(line)![2])
	const target = live !== -1 ? live : block.findIndex((line) => myTeamsLine.test(line))
	if (target === -1) {
		const indent = /^(\s+)\S/.exec(block.find((line) => /^\s+[^\s#]/.test(line)) ?? "")?.[1] ?? "  "
		return [...lines.slice(0, varsIndex + 1), entry(indent), ...lines.slice(varsIndex + 1)]
	}
	const match = myTeamsLine.exec(block[target]!)!
	const indent = match[1]!
	const drop = live === -1 ? 0 : valueContinuation(block, target, indent.length, match[3]!)
	if (drop < 0) return null
	const at = varsIndex + 1 + target
	return [...lines.slice(0, at), entry(indent), ...lines.slice(at + 1 + drop)]
}

const duplicateTopLevelKey = (lines: readonly string[]) => {
	const seen = new Set<string>()
	for (const line of lines) {
		const key = topLevelKeyName.exec(line)?.[1]
		if (!key) continue
		if (seen.has(key)) return key
		seen.add(key)
	}
	return null
}

const parseRaw = (text: string): unknown => {
	try {
		return Bun.YAML.parse(text)
	} catch {
		return undefined
	}
}

export const HAND_EDIT_MY_TEAMS = "Can't update my_teams in this layout; edit sections.yaml by hand (Edit sections config)"

/**
 * Set `vars.my_teams` in a sections.yaml by editing only that line. Never
 * rewrites the file from parsed data: the edit must leave every other key
 * (known or not) as it was, or it returns an error and nothing is written.
 * Keeps the file's line endings.
 */
export const setMyTeamsInYaml = (text: string, teams: readonly string[]): { readonly text: string } | { readonly error: string } => {
	const original = parseSectionsConfig(text)
	if (!("config" in original)) return original
	const eol = text.includes("\r\n") ? "\r\n" : "\n"
	const lines = text.split(/\r?\n/)
	const edited = editMyTeamsLines(lines, teams)
	if (edited === null || duplicateTopLevelKey(edited) !== null) return { error: HAND_EDIT_MY_TEAMS }
	const next = edited.join(eol)
	// Every other value must be untouched, including keys prs doesn't know about.
	const before = parseRaw(text)
	const after = parseRaw(next)
	const isMap = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
	if (!isMap(before) || !isMap(after)) return { error: HAND_EDIT_MY_TEAMS }
	const expected = { ...before, vars: { ...(isMap(before.vars) ? before.vars : {}), my_teams: [...teams] } }
	if (!Bun.deepEquals(after, expected)) return { error: HAND_EDIT_MY_TEAMS }
	const check = parseSectionsConfig(next)
	if (!("config" in check)) return { error: HAND_EDIT_MY_TEAMS }
	return { text: next }
}

export const myTeamsUnchanged = (current: readonly string[], next: readonly string[]) => sameStrings([...current].sort(), [...next].sort())
