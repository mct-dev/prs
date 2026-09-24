import { context } from "@ghui/keymap"

export interface CommentThreadModalCtx {
	readonly halfPage: number
	readonly closeModal: () => void
	readonly openInlineComment: () => void
	readonly scrollBy: (delta: number) => void
}

const Thread = context<CommentThreadModalCtx>()

export const commentThreadModalKeymap = Thread(
	{ id: "comment-thread.close", title: "Close", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "comment-thread.reply", title: "Reply", keys: ["return"], run: (s) => s.openInlineComment() },
	{ id: "comment-thread.up", title: "Up", keys: ["k", "up"], run: (s) => s.scrollBy(-1) },
	{ id: "comment-thread.down", title: "Down", keys: ["j", "down"], run: (s) => s.scrollBy(1) },
	{ id: "comment-thread.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.scrollBy(-s.halfPage) },
	{
		id: "comment-thread.half-down",
		title: "Half page down",
		keys: ["pagedown", "ctrl+d", "ctrl+v"],
		run: (s) => s.scrollBy(s.halfPage),
	},
)
