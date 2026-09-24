import { context } from "@ghui/keymap"

export interface CommentModalCtx {
	readonly closeModal: () => void
}

const Comment = context<CommentModalCtx>()

export const commentModalKeymap = Comment({ id: "comment.escape", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() })
