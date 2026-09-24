import { isBuiltinPreset, type ReviewAgentKind, type ReviewConfig, type ReviewPreset } from "./config.js"

/**
 * Edits to the raw `review` block of config.json, as written by the preset
 * modal. They touch only the preset being changed (and `default`), so the
 * merged built-ins never get copied into the file and unknown keys survive.
 */

/** The fields the modal edits; `agent` is fixed per preset. */
export interface PresetDraft {
	readonly id: string
	readonly agent: ReviewAgentKind
	readonly skill: string | null
	readonly model: string | null
	readonly maxBudgetUsd: number | null
	readonly extraPrompt: string
}

type RawRecord = Record<string, unknown>

const isRecord = (value: unknown): value is RawRecord => typeof value === "object" && value !== null && !Array.isArray(value)

const rawPresets = (review: RawRecord): RawRecord => (isRecord(review.presets) ? review.presets : {})

/** Writes the draft's fields over whatever the file has for that preset (so `command` etc. stay). */
export const upsertPresetRaw = (review: unknown, draft: PresetDraft): RawRecord => {
	const base = isRecord(review) ? review : {}
	const presets = rawPresets(base)
	const existing = isRecord(presets[draft.id]) ? (presets[draft.id] as RawRecord) : {}
	return {
		...base,
		presets: {
			...presets,
			[draft.id]: {
				...existing,
				agent: draft.agent,
				skill: draft.skill,
				model: draft.model,
				maxBudgetUsd: draft.maxBudgetUsd,
				extraPrompt: draft.extraPrompt,
			},
		},
	}
}

export const setDefaultPresetRaw = (review: unknown, id: string): RawRecord => ({ ...(isRecord(review) ? review : {}), default: id })

/**
 * Removes a preset: built-ins become `null` (so the merge leaves them out),
 * user presets lose their key. Deleting the default moves `default` to the
 * first remaining preset. Returns null when `id` is the last preset.
 */
export const deletePresetRaw = (review: unknown, id: string, config: ReviewConfig): RawRecord | null => {
	const remaining = Object.keys(config.presets)
		.filter((presetId) => presetId !== id)
		.sort()
	if (remaining.length === 0 || !config.presets[id]) return null
	const base = isRecord(review) ? review : {}
	const { [id]: _removed, ...rest } = rawPresets(base)
	const presets = isBuiltinPreset(id) ? { ...rest, [id]: null } : rest
	const next: RawRecord = { ...base, presets }
	if (config.defaultPreset === id) next.default = remaining[0]
	return next
}

// --- form -------------------------------------------------------------------

export const presetFormFields = ["skill", "model", "maxBudgetUsd", "extraPrompt"] as const
export type PresetFormField = (typeof presetFormFields)[number]
export type PresetFormValues = Readonly<Record<PresetFormField, string>>

export const presetFormLabels: Record<PresetFormField, string> = {
	skill: "skill",
	model: "model",
	maxBudgetUsd: "budget $",
	extraPrompt: "prompt",
}

export const claudeModelSuggestions = ["sonnet", "opus", "haiku"] as const

export const presetFormValues = (preset: Pick<ReviewPreset, "skill" | "model" | "maxBudgetUsd" | "extraPrompt">): PresetFormValues => ({
	skill: preset.skill ?? "",
	model: preset.model ?? "",
	maxBudgetUsd: preset.maxBudgetUsd === null ? "" : String(preset.maxBudgetUsd),
	extraPrompt: preset.extraPrompt,
})

/** A fresh preset: claude gets the stock `review` skill and a $3 cap, codex nothing. */
export const newPresetValues = (agent: ReviewAgentKind): PresetFormValues =>
	agent === "claude" ? { skill: "review", model: "", maxBudgetUsd: "3", extraPrompt: "" } : { skill: "", model: "", maxBudgetUsd: "", extraPrompt: "" }

export type PresetFormResult = { readonly _tag: "ok"; readonly draft: PresetDraft } | { readonly _tag: "error"; readonly field: PresetFormField; readonly message: string }

const blankToNull = (value: string) => (value.trim().length > 0 ? value.trim() : null)

export const validatePresetForm = (id: string, agent: ReviewAgentKind, values: PresetFormValues): PresetFormResult => {
	const budgetText = values.maxBudgetUsd.trim()
	let maxBudgetUsd: number | null = null
	if (budgetText.length > 0) {
		const budget = Number(budgetText.replace(/^\$/, ""))
		if (!Number.isFinite(budget) || budget <= 0) return { _tag: "error", field: "maxBudgetUsd", message: "Budget must be a number greater than 0 (or empty for none)." }
		maxBudgetUsd = budget
	}
	const skill = blankToNull(values.skill)
	if (skill && /\s/.test(skill)) return { _tag: "error", field: "skill", message: "Skill names have no spaces." }
	const model = blankToNull(values.model)
	if (model && /\s/.test(model)) return { _tag: "error", field: "model", message: "Model names have no spaces." }
	if (model?.startsWith("-")) return { _tag: "error", field: "model", message: "Model names can't start with -." }
	return { _tag: "ok", draft: { id, agent, skill, model, maxBudgetUsd, extraPrompt: values.extraPrompt.trim() } }
}

/** Error for a new preset name, or null when it is usable. */
export const presetNameError = (name: string, config: Pick<ReviewConfig, "presets">): string | null => {
	const trimmed = name.trim()
	if (trimmed.length === 0) return "Name the preset."
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(trimmed)) return "Use letters, digits, . _ - (max 32)."
	if (Object.hasOwn(config.presets, trimmed)) return `A preset named ${trimmed} exists.`
	return null
}
