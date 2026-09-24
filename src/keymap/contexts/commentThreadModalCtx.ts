import type { CommentThreadModalCtx } from "../commentThreadModal.ts"

export interface BuildCommentThreadModalCtxInput {
	readonly halfPage: number
	readonly closeActiveModal: () => void
	readonly openDiffCommentModal: () => void
	readonly scrollCommentThread: (delta: number) => void
}

export const buildCommentThreadModalCtx = ({ halfPage, closeActiveModal, openDiffCommentModal, scrollCommentThread }: BuildCommentThreadModalCtxInput): CommentThreadModalCtx => ({
	halfPage,
	closeModal: closeActiveModal,
	openInlineComment: openDiffCommentModal,
	scrollBy: scrollCommentThread,
})
