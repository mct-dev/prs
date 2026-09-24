import {
	backspace as editorBackspace,
	type CommentEditorValue,
	deleteForward as editorDeleteForward,
	deleteToLineEnd,
	deleteToLineStart,
	deleteWordBackward,
	deleteWordForward,
	insertText,
	moveLeft as editorMoveLeft,
	moveLineEnd,
	moveLineStart,
	moveRight as editorMoveRight,
	moveVertically,
	moveWordBackward,
	moveWordForward,
} from "../../ui/commentEditor.ts"
import type { SubmitReviewModalState } from "../../ui/modals.ts"
import type { SubmitReviewModalCtx } from "../submitReviewModal.ts"

export interface BuildSubmitReviewModalCtxInput {
	readonly submitReviewModal: SubmitReviewModalState
	readonly closeActiveModal: () => void
	readonly setSubmitReviewModal: (next: SubmitReviewModalState | ((prev: SubmitReviewModalState) => SubmitReviewModalState)) => void
	readonly confirmSubmitReview: () => void
	readonly editSubmitReview: (transform: (state: CommentEditorValue) => CommentEditorValue) => void
	readonly moveSubmitReviewActionSelection: (delta: -1 | 1) => void
}

export const buildSubmitReviewModalCtx = ({
	submitReviewModal,
	closeActiveModal,
	setSubmitReviewModal,
	confirmSubmitReview,
	editSubmitReview,
	moveSubmitReviewActionSelection,
}: BuildSubmitReviewModalCtxInput): SubmitReviewModalCtx => ({
	summaryFocused: submitReviewModal.focus === "body",
	handleEscape: () => {
		if (submitReviewModal.focus === "body") setSubmitReviewModal((current) => ({ ...current, focus: "action" }))
		else closeActiveModal()
	},
	submit: confirmSubmitReview,
	focusSummary: () => setSubmitReviewModal((current) => ({ ...current, focus: "body", error: null })),
	insertNewline: () => editSubmitReview((state) => insertText(state, "\n")),
	moveActionSelection: moveSubmitReviewActionSelection,
	moveLeft: () => editSubmitReview(editorMoveLeft),
	moveRight: () => editSubmitReview(editorMoveRight),
	moveUp: () => editSubmitReview((state) => moveVertically(state, -1)),
	moveDown: () => editSubmitReview((state) => moveVertically(state, 1)),
	moveLineStart: () => editSubmitReview(moveLineStart),
	moveLineEnd: () => editSubmitReview(moveLineEnd),
	moveWordBackward: () => editSubmitReview(moveWordBackward),
	moveWordForward: () => editSubmitReview(moveWordForward),
	backspace: () => editSubmitReview(editorBackspace),
	deleteForward: () => editSubmitReview(editorDeleteForward),
	deleteWordBackward: () => editSubmitReview(deleteWordBackward),
	deleteWordForward: () => editSubmitReview(deleteWordForward),
	deleteToLineStart: () => editSubmitReview(deleteToLineStart),
	deleteToLineEnd: () => editSubmitReview(deleteToLineEnd),
})
