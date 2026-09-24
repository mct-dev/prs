import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface TeamsModalCtx {
	readonly closeModal: () => void
	readonly save: () => void
	readonly toggle: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Teams = context<TeamsModalCtx>()

export const teamsModalKeymap = Teams(
	...selectionModalBindings<TeamsModalCtx>({
		id: "teams-modal",
		cancelTitle: "Close",
		close: (s) => s.closeModal(),
		confirm: { title: "Save my teams", run: (s) => s.save() },
		move: (s, delta) => s.moveSelection(delta),
	}),
	{ id: "teams-modal.toggle", title: "Toggle team", keys: ["space", "x"], run: (s) => s.toggle() },
)
