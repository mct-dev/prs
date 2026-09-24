import type { ReviewAgentKind } from "../../review/config.js"
import { claudeModelSuggestions, newPresetValues, presetFormFields, presetFormValues, presetNameError, type PresetFormField } from "../../review/presetEdits.js"
import { matchSkills } from "../../review/skills.js"
import type { ReviewPresetFormState, ReviewPresetModalState } from "./types.js"

/**
 * Pure transitions for the review preset modal. The hook wires them to keys
 * and adds the config writes; keeping them here keeps them testable.
 */

export const SUGGESTION_ROWS = 4

export interface PresetSuggestion {
	readonly value: string
	readonly detail: string
}

export const reviewAgentChoices: readonly ReviewAgentKind[] = ["claude", "codex"]

/** Autocomplete rows for the focused field: local skills, or claude model aliases. */
export const presetSuggestions = (state: ReviewPresetModalState): readonly PresetSuggestion[] => {
	const form = state.form
	if (!form) return []
	const query = form.completionQuery ?? form.values[form.field]
	if (form.field === "skill") return matchSkills(state.skills, form.agent, query).map((skill) => ({ value: skill.name, detail: skill.description }))
	if (form.field === "model" && form.agent === "claude") {
		const needle = query.trim().toLowerCase()
		return claudeModelSuggestions.filter((model) => model.startsWith(needle)).map((model) => ({ value: model, detail: "" }))
	}
	return []
}

const withForm = (state: ReviewPresetModalState, update: (form: ReviewPresetFormState) => ReviewPresetFormState): ReviewPresetModalState =>
	state.form ? { ...state, form: update(state.form), error: null } : state

export const toList = (state: ReviewPresetModalState, error: string | null = null): ReviewPresetModalState => ({ ...state, mode: "list", form: null, newName: "", error })

export const startEditPreset = (state: ReviewPresetModalState): ReviewPresetModalState => {
	const option = state.presets[state.selectedIndex]
	if (!option) return state
	return {
		...state,
		mode: "edit",
		error: null,
		form: { presetId: option.id, agent: option.preset.agent, isNew: false, field: "skill", values: presetFormValues(option.preset), suggestionIndex: 0, completionQuery: null },
	}
}

export const startNewPreset = (state: ReviewPresetModalState): ReviewPresetModalState => ({ ...state, mode: "pickAgent", newAgent: "claude", newName: "", error: null })

export const moveNewAgent = (state: ReviewPresetModalState, delta: -1 | 1): ReviewPresetModalState => {
	const index = reviewAgentChoices.indexOf(state.newAgent)
	const next = reviewAgentChoices[(index + delta + reviewAgentChoices.length) % reviewAgentChoices.length]!
	return { ...state, newAgent: next }
}

export const confirmNewAgent = (state: ReviewPresetModalState): ReviewPresetModalState => ({ ...state, mode: "name", newName: "", error: null })

/** Validates the typed name against existing presets and opens the form for it. */
export const confirmNewName = (state: ReviewPresetModalState): ReviewPresetModalState => {
	const error = presetNameError(state.newName, { presets: Object.fromEntries(state.presets.map((option) => [option.id, option.preset])) })
	if (error) return { ...state, error }
	return {
		...state,
		mode: "edit",
		error: null,
		form: {
			presetId: state.newName.trim(),
			agent: state.newAgent,
			isNew: true,
			field: "skill",
			values: newPresetValues(state.newAgent),
			suggestionIndex: 0,
			completionQuery: null,
		},
	}
}

export const editNewName = (state: ReviewPresetModalState, transform: (value: string) => string): ReviewPresetModalState => ({
	...state,
	newName: transform(state.newName),
	error: null,
})

export const moveFormField = (state: ReviewPresetModalState, delta: -1 | 1): ReviewPresetModalState =>
	withForm(state, (form) => {
		const index = presetFormFields.indexOf(form.field)
		const field: PresetFormField = presetFormFields[(index + delta + presetFormFields.length) % presetFormFields.length]!
		return { ...form, field, suggestionIndex: 0, completionQuery: null }
	})

export const editFormText = (state: ReviewPresetModalState, transform: (value: string) => string): ReviewPresetModalState =>
	withForm(state, (form) => ({ ...form, values: { ...form.values, [form.field]: transform(form.values[form.field]) }, suggestionIndex: 0, completionQuery: null }))

/**
 * Shell-style completion: tab fills the next suggestion for what was typed,
 * shift+tab the previous; with nothing to complete it moves to the next field.
 */
export const cycleSuggestion = (state: ReviewPresetModalState, delta: -1 | 1): ReviewPresetModalState => {
	const form = state.form
	if (!form) return state
	const suggestions = presetSuggestions(state)
	if (suggestions.length === 0) return moveFormField(state, delta)
	const started = form.completionQuery !== null
	const index = started ? (form.suggestionIndex + delta + suggestions.length) % suggestions.length : delta === 1 ? 0 : suggestions.length - 1
	return {
		...state,
		error: null,
		form: {
			...form,
			completionQuery: form.completionQuery ?? form.values[form.field],
			suggestionIndex: index,
			values: { ...form.values, [form.field]: suggestions[index]!.value },
		},
	}
}

export const requestDeletePreset = (state: ReviewPresetModalState): ReviewPresetModalState => {
	if (!state.presets[state.selectedIndex]) return state
	if (state.presets.length <= 1) return { ...state, error: "Can't delete the last preset." }
	return { ...state, mode: "confirmDelete", error: null }
}

export const moveListSelection = (state: ReviewPresetModalState, delta: -1 | 1): ReviewPresetModalState => ({
	...state,
	error: null,
	selectedIndex: state.presets.length === 0 ? 0 : (((state.selectedIndex + delta) % state.presets.length) + state.presets.length) % state.presets.length,
})
