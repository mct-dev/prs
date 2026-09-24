import type { AppCommand } from "../../commands.ts"
import type { CommandPaletteCtx } from "../commandPalette.ts"

export interface BuildCommandPaletteCtxInput {
	readonly closeActiveModal: () => void
	readonly selectedCommand: AppCommand | null
	readonly runCommandPaletteCommand: (command: AppCommand) => void
	readonly moveCommandPaletteSelection: (delta: -1 | 1) => void
}

export const buildCommandPaletteCtx = ({
	closeActiveModal,
	selectedCommand,
	runCommandPaletteCommand,
	moveCommandPaletteSelection,
}: BuildCommandPaletteCtxInput): CommandPaletteCtx => ({
	closeModal: closeActiveModal,
	runSelected: () => {
		if (selectedCommand) runCommandPaletteCommand(selectedCommand)
	},
	moveSelection: moveCommandPaletteSelection,
})
