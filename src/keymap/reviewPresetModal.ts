import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface ReviewPresetModalCtx {
	readonly closeModal: () => void
	readonly runSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const ReviewPreset = context<ReviewPresetModalCtx>()

export const reviewPresetModalKeymap = ReviewPreset(
	...selectionModalBindings<ReviewPresetModalCtx>({
		id: "review-preset-modal",
		cancelTitle: "Close",
		close: (s) => s.closeModal(),
		confirm: { title: "Run agent review with preset", run: (s) => s.runSelected() },
		move: (s, delta) => s.moveSelection(delta),
	}),
)
