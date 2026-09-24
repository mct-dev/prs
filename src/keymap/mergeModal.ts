import { context } from "@ghui/keymap"

export interface MergeModalCtx {
	readonly availableActionCount: number
	readonly multipleMethodsAllowed: boolean
	readonly inConfirmMode: boolean
	readonly closeOrBackOut: () => void
	readonly confirmMerge: () => void
	readonly cycleMethod: (delta: -1 | 1) => void
	readonly moveSelection: (delta: -1 | 1) => void
}

const Merge = context<MergeModalCtx>()

export const mergeModalKeymap = Merge(
	{ id: "merge-modal.cancel", title: "Cancel", keys: ["escape"], run: (s) => s.closeOrBackOut() },
	{
		id: "merge-modal.confirm",
		title: "Merge pull request",
		keys: ["return"],
		enabled: (s) => (s.availableActionCount > 0 ? true : "No merge actions available."),
		run: (s) => s.confirmMerge(),
	},
	{ id: "merge-modal.up", title: "Up", keys: ["k", "up"], when: (s) => !s.inConfirmMode, run: (s) => s.moveSelection(-1) },
	{ id: "merge-modal.down", title: "Down", keys: ["j", "down"], when: (s) => !s.inConfirmMode, run: (s) => s.moveSelection(1) },
	{
		id: "merge-modal.next-method",
		title: "Next merge method",
		keys: ["tab", "right", "l"],
		when: (s) => !s.inConfirmMode,
		enabled: (s) => (s.multipleMethodsAllowed ? true : "Only one merge method is allowed for this repository."),
		run: (s) => s.cycleMethod(1),
	},
	{
		id: "merge-modal.prev-method",
		title: "Previous merge method",
		keys: ["shift+tab", "left", "h"],
		when: (s) => !s.inConfirmMode,
		enabled: (s) => (s.multipleMethodsAllowed ? true : "Only one merge method is allowed for this repository."),
		run: (s) => s.cycleMethod(-1),
	},
)
