import { homedir } from "node:os"
import { join } from "node:path"
import { Schema } from "effect"

export const sectionSorts = ["updated", "-updated", "size", "-size", "age", "-age", "-risk", "risk"] as const
export type SectionSort = (typeof sectionSorts)[number]

export const SectionConfigSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	query: Schema.optionalKey(Schema.String),
	any: Schema.optionalKey(Schema.Array(Schema.String)),
	exclude: Schema.optionalKey(Schema.String),
	where: Schema.optionalKey(Schema.String),
	sort: Schema.optionalKey(Schema.Literals(sectionSorts)),
	limit: Schema.optionalKey(Schema.Number),
	collapsed: Schema.optionalKey(Schema.Boolean),
	exclusive: Schema.optionalKey(Schema.Boolean),
})
export type SectionConfig = typeof SectionConfigSchema.Type

export const SectionVarValueSchema = Schema.Union([Schema.String, Schema.Array(Schema.String)])
export type SectionVarValue = typeof SectionVarValueSchema.Type

export const SectionsConfigSchema = Schema.Struct({
	vars: Schema.optionalKey(Schema.Record(Schema.String, SectionVarValueSchema)),
	sections: Schema.Array(SectionConfigSchema),
})
export type SectionsConfig = typeof SectionsConfigSchema.Type

export const DEFAULT_SECTION_LIMIT = 50
export const MAX_SECTION_LIMIT = 500

export const defaultSectionsConfig: SectionsConfig = {
	vars: {
		bots: ["app/dependabot", "app/renovate", "app/github-actions"],
	},
	sections: [
		{
			id: "needs-me",
			title: "Needs my review",
			query: "review-requested:{me} -author:{me} draft:false",
			exclude: "author:{bots}",
		},
		{
			id: "rereview",
			title: "New commits since my review",
			query: "reviewed-by:{me} -author:{me}",
			where: "me.reviewed and not me.reviewed_since_push",
		},
		{
			id: "team",
			title: "My team's work",
			query: "team-authors:{my_teams} -author:{me}",
		},
		{
			id: "mine",
			title: "My PRs",
			query: "author:{me}",
		},
		{
			id: "bots",
			title: "Bots",
			any: ["review-requested:{me} author:{bots}"],
			collapsed: true,
		},
	],
}

export const sectionsConfigPath = () => {
	if (process.env.PRS_SECTIONS_PATH) return process.env.PRS_SECTIONS_PATH
	if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "prs", "sections.yaml")
	if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "prs", "sections.yaml")
	return join(homedir(), ".config", "prs", "sections.yaml")
}

export interface LoadedSectionsConfig {
	readonly config: SectionsConfig
	/** Set when the user file exists but could not be used; defaults apply. */
	readonly error: string | null
	readonly source: "defaults" | "file"
}

const formatError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	const firstLine = message.split("\n").find((line) => line.trim().length > 0) ?? message
	return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine
}

const validateSections = (config: SectionsConfig): string | null => {
	if (config.sections.length === 0) return "sections.yaml defines no sections"
	const seen = new Set<string>()
	for (const section of config.sections) {
		if (seen.has(section.id)) return `duplicate section id "${section.id}"`
		seen.add(section.id)
		if (section.query === undefined && (section.any === undefined || section.any.length === 0)) return `section "${section.id}" needs a query or any:`
	}
	return null
}

/** Parse YAML text into a validated config. Pure apart from `Bun.YAML`. */
export const parseSectionsConfig = (text: string): { readonly config: SectionsConfig } | { readonly error: string } => {
	let raw: unknown
	try {
		raw = Bun.YAML.parse(text)
	} catch (error) {
		return { error: `sections.yaml: ${formatError(error)}` }
	}
	let config: SectionsConfig
	try {
		config = Schema.decodeUnknownSync(SectionsConfigSchema)(raw)
	} catch (error) {
		return { error: `sections.yaml: ${formatError(error)}` }
	}
	const invalid = validateSections(config)
	return invalid === null ? { config } : { error: `sections.yaml: ${invalid}` }
}

export const loadSectionsConfig = async (path = sectionsConfigPath()): Promise<LoadedSectionsConfig> => {
	const file = Bun.file(path)
	if (!(await file.exists())) return { config: defaultSectionsConfig, error: null, source: "defaults" }
	const parsed = parseSectionsConfig(await file.text())
	return "config" in parsed ? { config: parsed.config, error: null, source: "file" } : { config: defaultSectionsConfig, error: parsed.error, source: "defaults" }
}
