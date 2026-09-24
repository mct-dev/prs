import { context } from "@prs/keymap"
import type { ReviewPresetModalMode } from "../ui/modals/types.js"
import { defaultVerticalKeys } from "./helpers.js"

export interface ReviewPresetModalCtx {
	readonly mode: ReviewPresetModalMode
	readonly closeModal: () => void
	readonly runSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
	readonly startEdit: () => void
	readonly startNew: () => void
	readonly setDefault: () => void
	readonly requestDelete: () => void
	readonly confirmDelete: () => void
	/** esc outside the list: back to the list without saving. */
	readonly back: () => void
	readonly moveAgent: (delta: -1 | 1) => void
	readonly confirmAgent: () => void
	readonly confirmName: () => void
	readonly moveField: (delta: -1 | 1) => void
	readonly cycleSuggestion: (delta: -1 | 1) => void
	readonly saveForm: () => void
}

const ReviewPreset = context<ReviewPresetModalCtx>()

const inList = (s: ReviewPresetModalCtx) => s.mode === "list"

// Letter keys are list-only: in the name and edit modes they are typed text.
export const reviewPresetModalKeymap = ReviewPreset(
	{ id: "review-preset-modal.cancel", title: "Close", keys: ["escape"], when: inList, run: (s) => s.closeModal() },
	{ id: "review-preset-modal.confirm", title: "Run agent review with preset", keys: ["return"], when: inList, run: (s) => s.runSelected() },
	{ id: "review-preset-modal.up", title: "Up", keys: [...defaultVerticalKeys.up], when: inList, run: (s) => s.moveSelection(-1) },
	{ id: "review-preset-modal.down", title: "Down", keys: [...defaultVerticalKeys.down], when: inList, run: (s) => s.moveSelection(1) },
	{ id: "review-preset-modal.edit", title: "Edit preset", keys: ["e"], when: inList, run: (s) => s.startEdit() },
	{ id: "review-preset-modal.new", title: "New preset", keys: ["n"], when: inList, run: (s) => s.startNew() },
	{ id: "review-preset-modal.default", title: "Set default preset", keys: ["d"], when: inList, run: (s) => s.setDefault() },
	{ id: "review-preset-modal.delete", title: "Delete preset", keys: ["x", "shift+d"], when: inList, run: (s) => s.requestDelete() },

	{ id: "review-preset-modal.back", title: "Back", keys: ["escape"], when: (s) => !inList(s), run: (s) => s.back() },

	{ id: "review-preset-modal.delete-confirm", title: "Confirm delete", keys: ["y", "return"], when: (s) => s.mode === "confirmDelete", run: (s) => s.confirmDelete() },
	{ id: "review-preset-modal.delete-cancel", title: "Keep preset", keys: ["n"], when: (s) => s.mode === "confirmDelete", run: (s) => s.back() },

	{ id: "review-preset-modal.agent-up", title: "Previous agent", keys: ["up", "k", "left", "h"], when: (s) => s.mode === "pickAgent", run: (s) => s.moveAgent(-1) },
	{ id: "review-preset-modal.agent-down", title: "Next agent", keys: ["down", "j", "right", "l", "tab"], when: (s) => s.mode === "pickAgent", run: (s) => s.moveAgent(1) },
	{ id: "review-preset-modal.agent-confirm", title: "Choose agent", keys: ["return"], when: (s) => s.mode === "pickAgent", run: (s) => s.confirmAgent() },

	{ id: "review-preset-modal.name-confirm", title: "Name preset", keys: ["return"], when: (s) => s.mode === "name", run: (s) => s.confirmName() },

	{ id: "review-preset-modal.field-up", title: "Previous field", keys: ["up"], when: (s) => s.mode === "edit", run: (s) => s.moveField(-1) },
	{ id: "review-preset-modal.field-down", title: "Next field", keys: ["down"], when: (s) => s.mode === "edit", run: (s) => s.moveField(1) },
	{ id: "review-preset-modal.complete", title: "Complete", keys: ["tab"], when: (s) => s.mode === "edit", run: (s) => s.cycleSuggestion(1) },
	{ id: "review-preset-modal.complete-back", title: "Complete (previous)", keys: ["shift+tab"], when: (s) => s.mode === "edit", run: (s) => s.cycleSuggestion(-1) },
	{ id: "review-preset-modal.save", title: "Save preset", keys: ["return"], when: (s) => s.mode === "edit", run: (s) => s.saveForm() },
)
