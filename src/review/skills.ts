import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import type { ReviewAgentKind } from "./config.js"

export type LocalSkillSource = "user" | "plugin" | "project" | "codex"

export interface LocalSkill {
	/** What the agent resolves: `review`, or `plugin:skill` for plugin skills. */
	readonly name: string
	readonly description: string
	readonly agent: ReviewAgentKind
	readonly source: LocalSkillSource
}

export interface SkillDiscoveryOptions {
	readonly home?: string
	/** Project root whose `.claude/skills` also count; omit to skip. */
	readonly cwd?: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const unquote = (value: string) => {
	const trimmed = value.trim()
	return (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")) ? trimmed.slice(1, -1) : trimmed
}

const lineFields = (block: string): Record<string, unknown> => {
	const fields: Record<string, unknown> = {}
	for (const line of block.split(/\r?\n/)) {
		const field = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
		if (field) fields[field[1]!] = unquote(field[2]!)
	}
	return fields
}

const frontmatterFields = (block: string): Record<string, unknown> => {
	try {
		const parsed = Bun.YAML.parse(block) as unknown
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
	} catch {
		// Hand-written frontmatter is often not strict YAML (unquoted colons); fall back to key: value lines.
	}
	return lineFields(block)
}

/** `name` and `description` from a SKILL.md YAML frontmatter block. Block scalars (`>-`, `|`) fold to one line. */
export const parseSkillFrontmatter = (text: string): { readonly name: string | null; readonly description: string } => {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
	if (!match) return { name: null, description: "" }
	const fields = frontmatterFields(match[1]!)
	const name = typeof fields.name === "string" ? fields.name.trim() : ""
	const description = typeof fields.description === "string" ? fields.description.replace(/\s+/g, " ").trim() : ""
	return { name: name.length > 0 ? name : null, description }
}

const scan = async (pattern: string, cwd: string): Promise<readonly string[]> => {
	try {
		return await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd, absolute: true, onlyFiles: true, followSymlinks: true }))
	} catch {
		return []
	}
}

const readSkill = async (path: string, agent: ReviewAgentKind, source: LocalSkillSource, prefix: string | null): Promise<LocalSkill | null> => {
	try {
		const parsed = parseSkillFrontmatter(await Bun.file(path).text())
		const name = parsed.name ?? basename(dirname(path))
		return { name: prefix ? `${prefix}:${name}` : name, description: parsed.description, agent, source }
	} catch {
		return null
	}
}

/**
 * Installed Claude plugins as `[pluginName, installPath]`. Reads
 * `installed_plugins.json` (v2: `{ plugins: { "name@marketplace": [{ installPath }] } }`)
 * so marketplace checkouts of plugins that are not installed stay out.
 */
const installedPlugins = async (claudeDir: string): Promise<readonly (readonly [string, string])[]> => {
	try {
		const raw = JSON.parse(await Bun.file(join(claudeDir, "plugins", "installed_plugins.json")).text()) as unknown
		const plugins = isRecord(raw) && isRecord(raw.plugins) ? raw.plugins : {}
		return Object.entries(plugins).flatMap(([key, installs]) => {
			const name = key.split("@")[0] ?? key
			const install = Array.isArray(installs) ? installs.find((entry) => isRecord(entry) && typeof entry.installPath === "string") : null
			return install && name ? [[name, (install as { installPath: string }).installPath] as const] : []
		})
	} catch {
		return []
	}
}

/**
 * Skills a review preset can name, found on this machine: personal Claude
 * skills, installed plugin skills (`plugin:skill`), the project's
 * `.claude/skills`, and personal Codex skills. Sorted and de-duplicated per
 * agent; unreadable directories are skipped.
 */
export const discoverLocalSkills = async (options: SkillDiscoveryOptions = {}): Promise<readonly LocalSkill[]> => {
	const home = options.home ?? homedir()
	const claudeDir = join(home, ".claude")
	const plugins = await installedPlugins(claudeDir)
	const groups = await Promise.all([
		scan("*/SKILL.md", join(claudeDir, "skills")).then((paths) => Promise.all(paths.map((path) => readSkill(path, "claude", "user", null)))),
		...plugins.map(([plugin, installPath]) =>
			scan("*/SKILL.md", join(installPath, "skills")).then((paths) => Promise.all(paths.map((path) => readSkill(path, "claude", "plugin", plugin)))),
		),
		options.cwd
			? scan("*/SKILL.md", join(options.cwd, ".claude", "skills")).then((paths) => Promise.all(paths.map((path) => readSkill(path, "claude", "project", null))))
			: Promise.resolve([]),
		scan("*/SKILL.md", join(home, ".codex", "skills")).then((paths) => Promise.all(paths.map((path) => readSkill(path, "codex", "codex", null)))),
	])
	const seen = new Set<string>()
	const skills: LocalSkill[] = []
	for (const skill of groups.flat()) {
		if (!skill || seen.has(`${skill.agent}:${skill.name}`)) continue
		seen.add(`${skill.agent}:${skill.name}`)
		skills.push(skill)
	}
	return skills.sort((left, right) => left.name.localeCompare(right.name))
}

/** Skills for one agent whose name contains `query`, prefix matches first. */
export const matchSkills = (skills: readonly LocalSkill[], agent: ReviewAgentKind, query: string): readonly LocalSkill[] => {
	const needle = query.trim().toLowerCase()
	const forAgent = skills.filter((skill) => skill.agent === agent)
	if (needle.length === 0) return forAgent
	const prefix = forAgent.filter((skill) => skill.name.toLowerCase().startsWith(needle) || skill.name.toLowerCase().includes(`:${needle}`))
	const rest = forAgent.filter((skill) => !prefix.includes(skill) && skill.name.toLowerCase().includes(needle))
	return [...prefix, ...rest]
}
