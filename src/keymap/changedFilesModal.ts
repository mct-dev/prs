import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface ChangedFilesModalCtx {
	readonly hasResults: boolean
	readonly closeModal: () => void
	readonly selectFile: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const ChangedFiles = context<ChangedFilesModalCtx>()

export const changedFilesModalKeymap = ChangedFiles(
	...selectionModalBindings<ChangedFilesModalCtx>({
		id: "changed-files",
		cancelTitle: "Close",
		close: (s) => s.closeModal(),
		confirm: {
			title: "Jump to file",
			enabled: (s) => (s.hasResults ? true : "No matching files."),
			run: (s) => s.selectFile(),
		},
		move: (s, delta) => s.moveSelection(delta),
	}),
)
