import { Effect } from "effect"
import { useRef } from "react"
import { errorMessage } from "../../errors.js"
import type { ReviewPresetModalCtx } from "../../keymap/reviewPresetModal.js"
import type { ReviewConfig } from "../../review/config.js"
import { deletePresetRaw, setDefaultPresetRaw, upsertPresetRaw, validatePresetForm } from "../../review/presetEdits.js"
import { discoverLocalSkills } from "../../review/skills.js"
import { loadStoredReviewConfig, updateStoredReviewConfig } from "../../themeStore.js"
import { reviewPresetOptions } from "../modals/ReviewPresetModal.js"
import {
	confirmNewAgent,
	confirmNewName,
	cycleSuggestion,
	editFormText,
	editNewName,
	moveFormField,
	moveListSelection,
	moveNewAgent,
	requestDeletePreset,
	startEditPreset,
	startNewPreset,
	toList,
} from "../modals/reviewPresetModel.js"
import type { ReviewPresetModalState } from "../modals/types.js"

export interface UseReviewPresetModalInput {
	readonly reviewPresetModal: ReviewPresetModalState
	readonly setReviewPresetModal: (next: ReviewPresetModalState | ((prev: ReviewPresetModalState) => ReviewPresetModalState)) => void
	readonly closeActiveModal: () => void
	readonly runSelected: () => void
	readonly flashNotice: (message: string) => void
}

export interface UseReviewPresetModalResult {
	readonly ctx: ReviewPresetModalCtx
	/** Text keystrokes for the name and edit modes (routed by the text-input dispatcher). */
	readonly editText: (transform: (value: string) => string) => void
}

/**
 * The preset modal's actions: pure transitions from reviewPresetModel plus
 * the config.json writes. After each write the presets are re-read from disk
 * so the list shows exactly what the next run will use.
 */
export const useReviewPresetModal = ({
	reviewPresetModal,
	setReviewPresetModal,
	closeActiveModal,
	runSelected,
	flashNotice,
}: UseReviewPresetModalInput): UseReviewPresetModalResult => {
	const stateRef = useRef(reviewPresetModal)
	stateRef.current = reviewPresetModal

	/** Applies a config edit, reloads, and returns to the list with `selectId` highlighted. */
	const writeAndReload = (edit: (review: unknown, config: ReviewConfig) => Record<string, unknown> | null, selectId: string | null, notice: string) => {
		void Effect.runPromise(
			Effect.gen(function* () {
				const current = (yield* loadStoredReviewConfig).review
				let refused = false
				yield* updateStoredReviewConfig((review) => {
					const next = edit(review, current)
					if (next) return next
					refused = true
					return review && typeof review === "object" ? (review as Record<string, unknown>) : {}
				})
				const presets = reviewPresetOptions((yield* loadStoredReviewConfig).review)
				return { presets, refused }
			}),
		)
			.then(({ presets, refused }) => {
				setReviewPresetModal((state) => {
					const index = selectId ? presets.findIndex((option) => option.id === selectId) : -1
					const selectedIndex = index >= 0 ? index : Math.min(state.selectedIndex, Math.max(0, presets.length - 1))
					return toList({ ...state, presets, selectedIndex }, refused ? "Can't delete the last preset." : null)
				})
				if (!refused) flashNotice(notice)
			})
			.catch((error) => setReviewPresetModal((state) => ({ ...state, error: `Couldn't save: ${errorMessage(error)}` })))
	}

	const loadSkills = () => {
		if (stateRef.current.skills.length > 0) return
		void discoverLocalSkills({ cwd: process.cwd() })
			.then((skills) => setReviewPresetModal((state) => ({ ...state, skills })))
			.catch(() => {})
	}

	const selectedId = () => stateRef.current.presets[stateRef.current.selectedIndex]?.id ?? null

	const ctx: ReviewPresetModalCtx = {
		mode: reviewPresetModal.mode,
		closeModal: closeActiveModal,
		runSelected,
		moveSelection: (delta) => setReviewPresetModal((state) => moveListSelection(state, delta)),
		startEdit: () => {
			setReviewPresetModal(startEditPreset)
			loadSkills()
		},
		startNew: () => {
			setReviewPresetModal(startNewPreset)
			loadSkills()
		},
		setDefault: () => {
			const id = selectedId()
			if (!id) return
			writeAndReload((review) => setDefaultPresetRaw(review, id), id, `Default review preset: ${id}`)
		},
		requestDelete: () => setReviewPresetModal(requestDeletePreset),
		confirmDelete: () => {
			const id = selectedId()
			if (!id) return
			writeAndReload((review, config) => deletePresetRaw(review, id, config), null, `Deleted review preset ${id}`)
		},
		back: () => setReviewPresetModal((state) => toList(state)),
		moveAgent: (delta) => setReviewPresetModal((state) => moveNewAgent(state, delta)),
		confirmAgent: () => setReviewPresetModal(confirmNewAgent),
		confirmName: () => setReviewPresetModal(confirmNewName),
		moveField: (delta) => setReviewPresetModal((state) => moveFormField(state, delta)),
		cycleSuggestion: (delta) => setReviewPresetModal((state) => cycleSuggestion(state, delta)),
		saveForm: () => {
			const form = stateRef.current.form
			if (!form) return
			const result = validatePresetForm(form.presetId, form.agent, form.values)
			if (result._tag === "error") {
				setReviewPresetModal((state) => (state.form ? { ...state, error: result.message, form: { ...state.form, field: result.field } } : state))
				return
			}
			writeAndReload((review) => upsertPresetRaw(review, result.draft), form.presetId, `${form.isNew ? "Created" : "Saved"} review preset ${form.presetId}`)
		},
	}

	const editText = (transform: (value: string) => string) =>
		setReviewPresetModal((state) => (state.mode === "name" ? editNewName(state, transform) : state.mode === "edit" ? editFormText(state, transform) : state))

	return { ctx, editText }
}
