import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "../src/index.ts"
import {
	type AppCtx,
	appKeymap,
	type CloseModalCtx,
	type DetailCtx,
	type DiffCommentCtx,
	type DiffCtx,
	type ListNavCtx,
	type MergeModalCtx,
} from "../examples/ghui-port.ts"

const makeCloseCtx = (log: string[]): CloseModalCtx => ({
	closeModal: () => log.push("close-modal"),
	confirmClose: () => log.push("confirm-close"),
})

const makeMergeCtx = (log: string[], availableActionCount: number): MergeModalCtx => ({
	availableActionCount,
	closeModal: () => log.push("merge-close"),
	confirmMerge: () => log.push("confirm-merge"),
	moveSelection: (delta) => log.push(`merge-move:${delta}`),
})

const makeDiffCtx = (log: string[]): DiffCtx => ({
	hasOpenPullRequest: true,
	halfPage: 10,
	scrollBy: (delta) => log.push(`diff-by:${delta}`),
	scrollTo: (line) => log.push(`diff-to:${line}`),
	closeDiff: () => log.push("diff-close"),
	enterCommentMode: () => log.push("diff-enter-comment"),
	toggleView: () => log.push("diff-toggle-view"),
	toggleWrap: () => log.push("diff-toggle-wrap"),
	reload: () => log.push("diff-reload"),
	nextFile: () => log.push("diff-next"),
	previousFile: () => log.push("diff-prev"),
	openInBrowser: () => log.push("diff-open-browser"),
})

const makeDiffCommentCtx = (log: string[], hasThread: boolean): DiffCommentCtx => ({
	halfPage: 10,
	hasThread,
	exitCommentMode: () => log.push("dc-exit"),
	toggleCommentMode: () => log.push("dc-toggle"),
	openInlineModal: () => log.push("dc-inline"),
	openThreadModal: () => log.push("dc-thread"),
	addComment: () => log.push("dc-add"),
	moveAnchor: (delta) => log.push(`dc-anchor:${delta}`),
	selectSide: (side) => log.push(`dc-side:${side}`),
	nextFile: () => log.push("dc-next"),
	previousFile: () => log.push("dc-prev"),
})

const makeDetailCtx = (log: string[]): DetailCtx => ({
	selectedPullRequest: { url: "x", state: "open" },
	halfPage: 10,
	scrollBy: (delta) => log.push(`det-by:${delta}`),
	scrollTo: (line) => log.push(`det-to:${line}`),
	closeDetail: () => log.push("det-close"),
	openTheme: () => log.push("det-theme"),
	openDiff: () => log.push("det-diff"),
	closePullRequest: () => log.push("det-close-pr"),
	openLabels: () => log.push("det-labels"),
	openMerge: () => log.push("det-merge"),
	toggleDraft: () => log.push("det-draft"),
	refresh: () => log.push("det-refresh"),
	openInBrowser: () => log.push("det-browser"),
	copyMetadata: () => log.push("det-copy"),
})

const makeListCtx = (log: string[]): ListNavCtx => ({
	hasFilterQuery: false,
	clearFilter: () => log.push("list-clear-filter"),
	openFilter: () => log.push("list-filter"),
	openTheme: () => log.push("list-theme"),
	switchQueueMode: (delta) => log.push(`list-tab:${delta}`),
	stepSelected: (delta) => log.push(`list-step:${delta}`),
	stepGroup: (delta) => log.push(`list-group:${delta}`),
	setSelected: (index) => log.push(`list-select:${index}`),
	visibleCount: 50,
})

interface Mode {
	readonly diffFullView?: boolean
	readonly diffCommentMode?: boolean
	readonly detailFullView?: boolean
	readonly anyModalActive?: boolean
	readonly closeModalActive?: boolean
	readonly mergeModalActive?: boolean
}

const makeAppCtx = (log: string[], mode: Mode = {}): AppCtx => ({
	diffFullView: mode.diffFullView ?? false,
	diffCommentMode: mode.diffCommentMode ?? false,
	detailFullView: mode.detailFullView ?? false,
	anyModalActive: mode.anyModalActive ?? mode.closeModalActive ?? mode.mergeModalActive ?? false,
	closeModalActive: mode.closeModalActive ?? false,
	mergeModalActive: mode.mergeModalActive ?? false,
	closeModal: makeCloseCtx(log),
	mergeModal: makeMergeCtx(log, 2),
	diff: makeDiffCtx(log),
	diffComment: makeDiffCommentCtx(log, false),
	detail: makeDetailCtx(log),
	listNav: makeListCtx(log),
	openCommandPalette: () => log.push("palette"),
})

describe("ghui port — appKeymap", () => {
	test("PR list nav: j/k step selection", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log)
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("j"))
		d.dispatch(parseKey("k"))
		expect(log).toEqual(["list-step:1", "list-step:-1"])
	})

	test("PR list gg/G top/bottom", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log)
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("g"))
		d.dispatch(parseKey("g"))
		expect(log).toEqual(["list-select:0"])
		d.dispatch(parseKey("shift+g"))
		expect(log).toEqual(["list-select:0", "list-select:49"])
	})

	test("ctrl+p opens palette regardless of mode", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log, { diffFullView: true })
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("ctrl+p"))
		expect(log).toEqual(["palette"])
	})

	test("close-modal: escape closes, return confirms", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log, { closeModalActive: true })
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("escape"))
		d.dispatch(parseKey("return"))
		expect(log).toEqual(["close-modal", "confirm-close"])
	})

	test("merge confirm disabled when no actions available", () => {
		const log: string[] = []
		let ctx: AppCtx = {
			...makeAppCtx(log, { mergeModalActive: true }),
			mergeModal: makeMergeCtx(log, 0),
		}
		const d = createDispatcher(appKeymap, () => ctx)
		const result = d.dispatch(parseKey("return"))
		expect(result.kind).toBe("disabled")
		if (result.kind === "disabled") expect(result.reason).toBe("No merge actions available.")
	})

	test("diff full view: gg jumps to top via shared scrollCommands", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log, { diffFullView: true })
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("g"))
		d.dispatch(parseKey("g"))
		expect(log).toEqual(["diff-to:0"])
	})

	test("diff comment mode: same key 'k' goes to anchor mover instead of scroll", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log, { diffFullView: true, diffCommentMode: true })
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("k"))
		expect(log).toEqual(["dc-anchor:-1"])
	})

	test("diff comment mode: enter opens thread modal when thread exists, else inline", () => {
		const log: string[] = []
		let ctx: AppCtx = {
			...makeAppCtx(log, { diffFullView: true, diffCommentMode: true }),
			diffComment: makeDiffCommentCtx(log, true),
		}
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("return"))
		expect(log).toEqual(["dc-thread"])
	})

	test("detail view: 'r' refreshes (selectedPullRequest is set)", () => {
		const log: string[] = []
		let ctx = makeAppCtx(log, { detailFullView: true })
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("r"))
		expect(log).toEqual(["det-refresh"])
	})

	test("detail view: 'x' close-pr disabled when state is not open", () => {
		const log: string[] = []
		let ctx: AppCtx = {
			...makeAppCtx(log, { detailFullView: true }),
			detail: { ...makeDetailCtx(log), selectedPullRequest: { url: "x", state: "merged" } },
		}
		const d = createDispatcher(appKeymap, () => ctx)
		const result = d.dispatch(parseKey("x"))
		expect(result.kind).toBe("disabled")
	})

	test("scopes are exclusive: 'k' means three different things in three modes", () => {
		const log: string[] = []
		// 1. Idle: list step
		let ctx = makeAppCtx(log)
		const d = createDispatcher(appKeymap, () => ctx)
		d.dispatch(parseKey("k"))

		// 2. Diff view: scroll up by one
		ctx = makeAppCtx(log, { diffFullView: true })
		d.dispatch(parseKey("k"))

		// 3. Diff comment mode: anchor move
		ctx = makeAppCtx(log, { diffFullView: true, diffCommentMode: true })
		d.dispatch(parseKey("k"))

		expect(log).toEqual(["list-step:-1", "diff-by:-1", "dc-anchor:-1"])
	})

	test("appKeymap.commands(ctx) projects active commands for palette", () => {
		const log: string[] = []
		const ctx = makeAppCtx(log, { detailFullView: true })
		const ids = appKeymap.commands(ctx).map((c) => c.meta.id).sort()
		// Must include detail-only commands
		expect(ids).toContain("detail.refresh")
		expect(ids).toContain("scroll.up")
		// And the always-on palette opener
		expect(ids).toContain("command.open")
		// Must NOT include list-nav or diff-only commands
		expect(ids).not.toContain("list.step-up")
		expect(ids).not.toContain("diff.close")
	})
})
