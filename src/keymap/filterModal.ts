import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface FilterModalCtx {
	readonly closeModal: () => void
	readonly applySelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Filter = context<FilterModalCtx>()

export const filterModalKeymap = Filter(
	...selectionModalBindings<FilterModalCtx>({
		id: "filter-modal",
		cancelTitle: "Close",
		close: (s) => s.closeModal(),
		confirm: { title: "Apply filter", run: (s) => s.applySelected() },
		move: (s, delta) => s.moveSelection(delta),
	}),
)
