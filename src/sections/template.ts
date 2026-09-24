import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { parseSectionsConfig, type SectionsConfig, type SectionVarValue } from "./config.js"

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

/** Write the template to `path` unless a file is already there. Returns true when it created one. */
export const ensureSectionsConfigFile = async (path: string): Promise<boolean> => {
	const file = Bun.file(path)
	if (await file.exists()) return false
	await mkdir(dirname(path), { recursive: true })
	await Bun.write(path, SECTIONS_TEMPLATE)
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

const topLevelKey = /^[A-Za-z_][\w-]*\s*:/
const myTeamsLine = /^(\s+)#?\s*my_teams\s*:/

/**
 * Edit only the `my_teams:` line so comments and layout survive. A commented
 * `# my_teams:` line is replaced in place; otherwise the line goes right after
 * `vars:` (added above `sections:` if missing).
 */
const editMyTeamsLines = (text: string, teams: readonly string[]): string => {
	const lines = text.split("\n")
	const varsIndex = lines.findIndex((line) => /^vars\s*:\s*(#.*)?$/.test(line))
	const entry = (indent: string) => `${indent}my_teams: ${flowList(teams)}`
	if (varsIndex === -1) {
		const sectionsIndex = lines.findIndex((line) => /^sections\s*:/.test(line))
		const at = sectionsIndex === -1 ? 0 : sectionsIndex
		return [...lines.slice(0, at), "vars:", entry("  "), "", ...lines.slice(at)].join("\n")
	}
	let end = varsIndex + 1
	while (end < lines.length && !topLevelKey.test(lines[end]!)) end++
	const block = lines.slice(varsIndex + 1, end)
	// Prefer a live line over a commented example.
	const live = block.findIndex((line) => myTeamsLine.test(line) && !line.trimStart().startsWith("#"))
	const target = live !== -1 ? live : block.findIndex((line) => myTeamsLine.test(line))
	if (target === -1) {
		const indent = /^(\s+)\S/.exec(block.find((line) => /^\s+[^\s#]/.test(line)) ?? "")?.[1] ?? "  "
		return [...lines.slice(0, varsIndex + 1), entry(indent), ...lines.slice(varsIndex + 1)].join("\n")
	}
	const indent = myTeamsLine.exec(block[target]!)![1]!
	// Drop a block-style list (`- org/team` lines) under a live `my_teams:`.
	let drop = 1
	if (live !== -1) while (target + drop < block.length && new RegExp(`^${indent}\\s+-\\s`).test(block[target + drop]!)) drop++
	const at = varsIndex + 1 + target
	return [...lines.slice(0, at), entry(indent), ...lines.slice(at + drop)].join("\n")
}

const withMyTeams = (config: SectionsConfig, teams: readonly string[]): SectionsConfig => ({ ...config, vars: { ...config.vars, my_teams: [...teams] } })

/**
 * Set `vars.my_teams` in a sections.yaml, keeping every other key. Tries a
 * line edit first and checks it parses to the expected config; if not (odd
 * layout), rewrites the whole file from the parsed config, losing comments.
 * Returns an error when the file itself doesn't parse, so nothing is clobbered.
 */
export const setMyTeamsInYaml = (text: string, teams: readonly string[]): { readonly text: string } | { readonly error: string } => {
	const original = parseSectionsConfig(text)
	if (!("config" in original)) return original
	const expected = withMyTeams(original.config, teams)
	const edited = editMyTeamsLines(text, teams)
	const check = parseSectionsConfig(edited)
	if ("config" in check && Bun.deepEquals(check.config, expected)) return { text: edited }
	return { text: `${Bun.YAML.stringify(expected, null, 2)}\n` }
}

export const myTeamsUnchanged = (current: readonly string[], next: readonly string[]) => sameStrings([...current].sort(), [...next].sort())
