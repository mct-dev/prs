import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface LabelModalCtx {
	readonly closeModal: () => void
	readonly toggleSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Label = context<LabelModalCtx>()

export const labelModalKeymap = Label(
	...selectionModalBindings<LabelModalCtx>({
		id: "label-modal",
		cancelTitle: "Close",
		close: (s) => s.closeModal(),
		confirm: { title: "Toggle label", run: (s) => s.toggleSelected() },
		move: (s, delta) => s.moveSelection(delta),
	}),
)
