import { context, type Scrollable, scrollCommands } from "@ghui/keymap"

export interface DetailViewCtx extends Scrollable {
	readonly closeDetail: () => void
	readonly openTheme: () => void
	readonly openDiff: () => void
	readonly openRuns: () => void
	readonly openComments: () => void
	readonly openReview: () => void
	readonly closeSelectedItem: () => void
	readonly openLabels: () => void
	readonly openMerge: () => void
	readonly toggleDraft: () => void
	readonly refresh: () => void
	readonly openInBrowser: () => void
	readonly openInEditor: () => void
	readonly copyMetadata: () => void
}

const Detail = context<DetailViewCtx>()

export const detailViewKeymap = Detail(
	scrollCommands<DetailViewCtx>(),
	{ id: "detail.close", title: "Close detail", keys: ["escape", "return"], run: (s) => s.closeDetail() },
	{ id: "detail.theme", title: "Open theme", keys: ["t"], run: (s) => s.openTheme() },
	{ id: "detail.diff", title: "Open diff", keys: ["d"], run: (s) => s.openDiff() },
	{ id: "detail.runs", title: "Open workflow runs", keys: ["a"], run: (s) => s.openRuns() },
	{ id: "detail.comments", title: "Open comments", keys: ["c"], run: (s) => s.openComments() },
	{ id: "detail.review", title: "Review pull request", keys: ["shift+r"], run: (s) => s.openReview() },
	{ id: "detail.close-item", title: "Close pull request or issue", keys: ["x"], run: (s) => s.closeSelectedItem() },
	{ id: "detail.labels", title: "Manage labels", keys: ["l"], run: (s) => s.openLabels() },
	{ id: "detail.merge", title: "Merge", keys: ["m", "shift+m"], run: (s) => s.openMerge() },
	{ id: "detail.toggle-draft", title: "Toggle draft", keys: ["s", "shift+s"], run: (s) => s.toggleDraft() },
	{ id: "detail.refresh", title: "Refresh", keys: ["r"], run: (s) => s.refresh() },
	{ id: "detail.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{ id: "detail.open-editor", title: "Open in editor", keys: ["e"], run: (s) => s.openInEditor() },
	{ id: "detail.copy", title: "Copy metadata", keys: ["y"], run: (s) => s.copyMetadata() },
)
