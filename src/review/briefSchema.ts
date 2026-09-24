import { Effect, Schema } from "effect"

export const RiskLevel = Schema.Literals(["low", "medium", "high"])
export type RiskLevel = typeof RiskLevel.Type

const OptionalNullableString = Schema.optionalKey(Schema.NullOr(Schema.String))

export const FocusArea = Schema.Struct({
	file: Schema.String,
	lines: OptionalNullableString,
	why: Schema.String,
	severity: RiskLevel,
})
export type FocusArea = typeof FocusArea.Type

export const SafeToSkip = Schema.Struct({
	path: Schema.String,
	why: Schema.String,
})
export type SafeToSkip = typeof SafeToSkip.Type

/**
 * The fixed risk brief every review preset must produce. Optional fields accept
 * either a missing key or `null`, because the JSON Schema below is written in
 * strict mode (every key required, optional values nullable).
 */
export const RiskBrief = Schema.Struct({
	risk: RiskLevel,
	summary: Schema.String,
	before_after: OptionalNullableString,
	focus_areas: Schema.Array(FocusArea),
	safe_to_skip: Schema.Array(SafeToSkip),
	questions: Schema.Array(Schema.String),
	tests: OptionalNullableString,
	confidence: RiskLevel,
})
export type RiskBrief = typeof RiskBrief.Type

export const decodeRiskBrief = Schema.decodeUnknownEffect(RiskBrief)
export const decodeRiskBriefSync = Schema.decodeUnknownSync(RiskBrief)

export const parseRiskBriefJson = (json: string) =>
	Effect.try({
		try: () => JSON.parse(json) as unknown,
		catch: (cause) => new Error(`Brief is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`),
	}).pipe(Effect.flatMap(decodeRiskBrief))

const levelSchema = { type: "string", enum: ["low", "medium", "high"] } as const
const nullableString = { type: ["string", "null"] } as const

/**
 * Hand-written JSON Schema for `claude --json-schema` and `codex --output-schema`.
 * Kept compatible with OpenAI structured-output strict mode: every object sets
 * `additionalProperties: false` and lists every property in `required`.
 */
export const riskBriefJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["risk", "summary", "before_after", "focus_areas", "safe_to_skip", "questions", "tests", "confidence"],
	properties: {
		risk: { ...levelSchema, description: "Overall risk of merging this PR." },
		summary: { type: "string", description: "One or two sentences: what this PR does." },
		before_after: { ...nullableString, description: "Behavior change in plain words, or null." },
		focus_areas: {
			type: "array",
			description: "Where a human reviewer should spend attention, most important first.",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["file", "lines", "why", "severity"],
				properties: {
					file: { type: "string" },
					lines: { ...nullableString, description: "Line range such as 10-42, or null." },
					why: { type: "string" },
					severity: levelSchema,
				},
			},
		},
		safe_to_skip: {
			type: "array",
			description: "Paths or globs that need little or no review.",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["path", "why"],
				properties: {
					path: { type: "string" },
					why: { type: "string" },
				},
			},
		},
		questions: { type: "array", items: { type: "string" }, description: "Judgment calls for the human reviewer." },
		tests: { ...nullableString, description: "Are the risky parts tested? Or null." },
		confidence: { ...levelSchema, description: "Confidence in this assessment." },
	},
} as const

export const riskBriefJsonSchemaString = JSON.stringify(riskBriefJsonSchema)
