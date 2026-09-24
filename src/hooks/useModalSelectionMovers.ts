import type { AppCommand } from "../commands.js"
import { clampCommandIndex } from "../commands.js"
import { filterLabels } from "../ui/modals/shared.js"
import type { ChangedFilesModalState, CommandPaletteState, CommentThreadModalState, LabelModalState, SubmitReviewModalState } from "../ui/modals/types.js"

const wrapIndex = (index: number, length: number) => (length === 0 ? 0 : ((index % length) + length) % length)

export interface UseModalSelectionMoversInput {
	readonly labelModal: LabelModalState
	readonly commandPaletteCommands: readonly AppCommand[]
	readonly changedFileResultsLength: number
	readonly submitReviewOptionsLength: number
	readonly setCommentThreadModal: (next: (prev: CommentThreadModalState) => CommentThreadModalState) => void
	readonly setLabelModal: (next: (prev: LabelModalState) => LabelModalState) => void
	readonly setChangedFilesModal: (next: (prev: ChangedFilesModalState) => ChangedFilesModalState) => void
	readonly setSubmitReviewModal: (next: (prev: SubmitReviewModalState) => SubmitReviewModalState) => void
	readonly setCommandPalette: (next: (prev: CommandPaletteState) => CommandPaletteState) => void
}

export interface ModalSelectionMovers {
	readonly scrollCommentThread: (delta: number) => void
	readonly moveLabelSelection: (delta: -1 | 1) => void
	readonly moveChangedFileSelection: (delta: -1 | 1) => void
	readonly moveSubmitReviewActionSelection: (delta: -1 | 1) => void
	readonly moveCommandPaletteSelection: (delta: -1 | 1) => void
	readonly selectCommandPaletteIndex: (index: number) => void
}

export const useModalSelectionMovers = ({
	labelModal,
	commandPaletteCommands,
	changedFileResultsLength,
	submitReviewOptionsLength,
	setCommentThreadModal,
	setLabelModal,
	setChangedFilesModal,
	setSubmitReviewModal,
	setCommandPalette,
}: UseModalSelectionMoversInput): ModalSelectionMovers => ({
	scrollCommentThread: (delta) => setCommentThreadModal((current) => ({ ...current, scrollOffset: Math.max(0, current.scrollOffset + delta) })),
	moveLabelSelection: (delta) =>
		setLabelModal((current) => {
			const filtered = filterLabels(labelModal.availableLabels, labelModal.query)
			const selectedIndex = wrapIndex(current.selectedIndex + delta, filtered.length)
			return selectedIndex === current.selectedIndex ? current : { ...current, selectedIndex }
		}),
	moveChangedFileSelection: (delta) =>
		setChangedFilesModal((current) => {
			const selectedIndex = wrapIndex(current.selectedIndex + delta, changedFileResultsLength)
			return selectedIndex === current.selectedIndex ? current : { ...current, selectedIndex }
		}),
	moveSubmitReviewActionSelection: (delta) =>
		setSubmitReviewModal((current) => {
			const selectedIndex = wrapIndex(current.selectedIndex + delta, submitReviewOptionsLength)
			return { ...current, selectedIndex, error: null }
		}),
	moveCommandPaletteSelection: (delta) =>
		setCommandPalette((current) => {
			const selectedIndex = wrapIndex(current.selectedIndex + delta, commandPaletteCommands.length)
			return selectedIndex === current.selectedIndex ? current : { ...current, selectedIndex }
		}),
	selectCommandPaletteIndex: (index) =>
		setCommandPalette((current) => {
			const selectedIndex = clampCommandIndex(index, commandPaletteCommands)
			return selectedIndex === current.selectedIndex ? current : { ...current, selectedIndex }
		}),
})
