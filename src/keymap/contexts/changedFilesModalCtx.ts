import type { ChangedFilesModalCtx } from "../changedFilesModal.ts"

export interface BuildChangedFilesModalCtxInput {
	readonly hasResults: boolean
	readonly closeActiveModal: () => void
	readonly selectChangedFile: () => void
	readonly moveChangedFileSelection: (delta: -1 | 1) => void
}

export const buildChangedFilesModalCtx = ({ hasResults, closeActiveModal, selectChangedFile, moveChangedFileSelection }: BuildChangedFilesModalCtxInput): ChangedFilesModalCtx => ({
	hasResults,
	closeModal: closeActiveModal,
	selectFile: selectChangedFile,
	moveSelection: moveChangedFileSelection,
})
