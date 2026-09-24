import { homedir } from "node:os"

/**
 * Pure helpers for the "open in editor" feature. No I/O, no service deps —
 * just `repoPaths` resolution (mirroring gh-dash) and command-template
 * substitution. The `EditorOpener` service owns the actual subprocess + TUI
 * suspension; everything here is unit-testable in isolation.
 */

export interface EditorCommandFields {
	readonly repository: string
	readonly number: number
	readonly headRef: string
	readonly baseRef: string
	readonly author: string
	readonly url: string
}

/** Map of `owner/repo` / wildcard / `:owner/:repo` template patterns to local paths. */
export type RepoPaths = Readonly<Record<string, string>>

const expandHome = (value: string) => {
	if (value === "~") return homedir()
	if (value.startsWith("~/")) return `${homedir()}/${value.slice(2)}`
	return value
}

const splitRepo = (repository: string): { owner: string; name: string } | null => {
	const [owner, name] = repository.split("/")
	return owner && name ? { owner, name } : null
}

/**
 * Resolve a local clone path for `owner/repo` using gh-dash-style precedence:
 *   1. exact full-name key (`dlvhdr/gh-dash`)
 *   2. owner wildcard (`dlvhdr/*`) — the trailing `*` expands to the repo name
 *   3. generic template (`:owner/:repo`) — `:owner` / `:repo` are substituted
 * Returns null when nothing matches. `~` is expanded to the home directory.
 */
export const resolveRepoPath = (repoPaths: RepoPaths, repository: string): string | null => {
	const parts = splitRepo(repository)
	if (!parts) return null
	const { owner, name } = parts

	const exact = repoPaths[repository]
	if (exact !== undefined) return expandHome(exact)

	const ownerWildcardKey = `${owner}/*`
	const ownerWildcard = repoPaths[ownerWildcardKey]
	if (ownerWildcard !== undefined) return expandHome(ownerWildcard.replace(/\*/g, name))

	const template = repoPaths[":owner/:repo"]
	if (template !== undefined) return expandHome(template.replace(/:owner/g, owner).replace(/:repo/g, name))

	return null
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g

/**
 * Substitute `{{token}}` placeholders in a command template. Unknown tokens are
 * left untouched (so a stray `{{foo}}` is visible rather than silently dropped).
 */
export const renderEditorCommand = (template: string, fields: EditorCommandFields, repoPath: string | null): string => {
	const values: Record<string, string> = {
		repo: fields.repository,
		repository: fields.repository,
		number: String(fields.number),
		headRef: fields.headRef,
		headRefName: fields.headRef,
		baseRef: fields.baseRef,
		baseRefName: fields.baseRef,
		author: fields.author,
		url: fields.url,
		repoPath: repoPath ?? "",
	}
	const split = splitRepo(fields.repository)
	if (split) {
		values.owner = split.owner
		values.name = split.name
	}
	return template.replace(TOKEN_PATTERN, (whole, token: string) => (token in values ? values[token]! : whole))
}

/** True when the template references `{{repoPath}}` (so a missing path should block). */
export const commandNeedsRepoPath = (template: string): boolean => {
	let match: RegExpExecArray | null
	TOKEN_PATTERN.lastIndex = 0
	while ((match = TOKEN_PATTERN.exec(template)) !== null) {
		if (match[1] === "repoPath") return true
	}
	return false
}
