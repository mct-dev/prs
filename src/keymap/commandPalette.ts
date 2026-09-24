import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface CommandPaletteCtx {
	readonly closeModal: () => void
	readonly runSelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Palette = context<CommandPaletteCtx>()

// `k`/`j` are typeable text in the palette search field, so the vertical keys
// stick to arrows + emacs-style ctrl chords.
export const commandPaletteKeymap = Palette(
	...selectionModalBindings<CommandPaletteCtx>({
		id: "palette",
		cancelTitle: "Close palette",
		cancelKeys: ["escape", "ctrl+c"],
		close: (s) => s.closeModal(),
		confirm: { title: "Run command", run: (s) => s.runSelected() },
		move: (s, delta) => s.moveSelection(delta),
		verticalKeys: { up: ["up", "ctrl+p", "ctrl+k"], down: ["down", "ctrl+n", "ctrl+j"] },
	}),
)
