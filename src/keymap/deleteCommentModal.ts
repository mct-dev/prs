import { context } from "@ghui/keymap"
import { confirmModalBindings } from "./helpers.js"

export interface DeleteCommentModalCtx {
	readonly closeModal: () => void
	readonly confirmDelete: () => void
}

const DeleteComment = context<DeleteCommentModalCtx>()

export const deleteCommentModalKeymap = DeleteComment(
	...confirmModalBindings<DeleteCommentModalCtx>({
		id: "delete-comment-modal",
		close: (s) => s.closeModal(),
		confirm: { title: "Delete comment", run: (s) => s.confirmDelete() },
	}),
)
