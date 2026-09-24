import { context, type Scrollable, scrollCommands } from "@ghui/keymap"

export interface CommentsViewCtx extends Scrollable {
	readonly visibleCount: number
	readonly canEditSelected: boolean
	// Review comments sit on a file: enter shows them in the diff.
	readonly onReviewComment: boolean
	readonly closeCommentsView: () => void
	readonly openInBrowser: () => void
	readonly refresh: () => void
	readonly newComment: () => void
	readonly confirmSelection: () => void
	readonly openInDiff: () => void
	readonly reply: () => void
	readonly editSelected: () => void
	readonly deleteSelected: () => void
	readonly toggleCard: () => void
	readonly toggleDetails: () => void
	readonly openLink: (index: number) => void
}

const Comments = context<CommentsViewCtx>()

export const commentsViewKeymap = Comments(
	scrollCommands<CommentsViewCtx>(),
	{ id: "comments-view.close", title: "Close comments", keys: ["escape", "c"], run: (s) => s.closeCommentsView() },
	{ id: "comments-view.show-in-diff", title: "Show comment in diff", keys: ["return"], when: (s) => s.onReviewComment, run: (s) => s.openInDiff() },
	{ id: "comments-view.confirm", title: "Reply / new comment", keys: ["return"], run: (s) => s.confirmSelection() },
	{ id: "comments-view.diff", title: "Show comment in diff", keys: ["d"], run: (s) => s.openInDiff() },
	{ id: "comments-view.reply", title: "Reply to comment", keys: ["shift+r"], run: (s) => s.reply() },
	{ id: "comments-view.new", title: "New comment", keys: ["a"], run: (s) => s.newComment() },
	{ id: "comments-view.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{ id: "comments-view.refresh", title: "Refresh", keys: ["r"], run: (s) => s.refresh() },
	{ id: "comments-view.edit", title: "Edit comment", keys: ["e"], when: (s) => s.canEditSelected, run: (s) => s.editSelected() },
	{ id: "comments-view.toggle-card", title: "Expand / collapse comment", keys: ["space"], run: (s) => s.toggleCard() },
	{ id: "comments-view.toggle-details", title: "Expand / collapse details", keys: ["t"], run: (s) => s.toggleDetails() },
	...Array.from({ length: 9 }, (_, offset) => ({
		id: `comments-view.open-link-${offset + 1}`,
		title: `Open link [${offset + 1}]`,
		keys: [String(offset + 1)],
		run: (s: CommentsViewCtx) => s.openLink(offset + 1),
	})),
	{ id: "comments-view.delete", title: "Delete comment", keys: ["x"], when: (s) => s.canEditSelected, run: (s) => s.deleteSelected() },
)
