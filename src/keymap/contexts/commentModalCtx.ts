import type { CommentModalCtx } from "../commentModal.ts"

export interface BuildCommentModalCtxInput {
	readonly closeActiveModal: () => void
}

export const buildCommentModalCtx = ({ closeActiveModal }: BuildCommentModalCtxInput): CommentModalCtx => ({
	closeModal: closeActiveModal,
})
