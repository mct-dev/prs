import { describe, expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import { buildPullRequestListRows, pullRequestListRowIndex, pullRequestListVisualLineCount } from "../src/ui/PullRequestList.tsx"

const pullRequest = (overrides: Partial<PullRequestItem> = {}): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: "abc123",
	headRefName: "feature/pagination",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 1,
	title: "Update pagination",
	body: "",
	labels: [],
	additions: 0,
	deletions: 0,
	changedFiles: 0,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: false,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/1",
	...overrides,
})

describe("buildPullRequestListRows", () => {
	test("shows a loaded-count footer when more pull requests are available", () => {
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", [pullRequest()]]],
			status: "ready",
			error: null,
			filterText: "",
			loadedCount: 50,
			hasMore: true,
			isLoadingMore: false,
		})

		expect(rows.at(-1)).toEqual({ _tag: "load-more", text: "↓ Press enter to load more  ·  50 loaded" })
	})

	test("shows an in-progress footer while loading the next page", () => {
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", [pullRequest()]]],
			status: "ready",
			error: null,
			filterText: "",
			loadedCount: 50,
			hasMore: true,
			isLoadingMore: true,
			loadingIndicator: "⠋",
		})

		expect(rows.at(-1)).toEqual({ _tag: "load-more", text: "⠋ Loading more pull requests... (50 loaded)" })
	})

	test("maps pull requests to their first visual line", () => {
		const first = pullRequest({ number: 1, url: "https://github.com/owner/repo/pull/1" })
		const second = pullRequest({ number: 2, url: "https://github.com/owner/repo/pull/2" })
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", [first, second]]],
			status: "ready",
			error: null,
			filterText: "",
			loadedCount: 2,
			hasMore: false,
			isLoadingMore: false,
		})

		expect(pullRequestListRowIndex(rows, first.url)).toBe(2)
		expect(pullRequestListRowIndex(rows, second.url)).toBe(4)
	})

	test("uses one visual line per pull request in authored-only views", () => {
		const first = pullRequest({ number: 1, url: "https://github.com/owner/repo/pull/1" })
		const second = pullRequest({ number: 2, url: "https://github.com/owner/repo/pull/2" })
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", [first, second]]],
			status: "ready",
			error: null,
			filterText: "",
			loadedCount: 2,
			hasMore: false,
			isLoadingMore: false,
			compact: true,
		})

		expect(pullRequestListRowIndex(rows, second.url)).toBe(3)
		expect(pullRequestListVisualLineCount(rows)).toBe(4)
	})
})

describe("buildPullRequestListRows with sections", () => {
	const header = (id: string, overrides: Partial<{ status: "loading" | "ready" | "error"; error: string | null; collapsed: boolean; count: number }> = {}) => ({
		id,
		title: id,
		status: "ready" as const,
		error: null,
		collapsed: false,
		count: 0,
		...overrides,
	})
	const first = pullRequest({ number: 1, url: "https://github.com/owner/repo/pull/1" })
	const second = pullRequest({ number: 2, url: "https://github.com/owner/repo/pull/2" })
	const base = { status: "ready" as const, error: null, filterText: "", loadedCount: 2, hasMore: true, isLoadingMore: false, showTitle: false }

	test("renders a header per section, skips collapsed PRs, and never adds load-more", () => {
		const rows = buildPullRequestListRows({
			...base,
			groups: [["needs-me", [first]]],
			sections: {
				headers: [header("needs-me", { count: 1 }), header("mine", { collapsed: true, count: 1 }), header("bots", { status: "error", error: "rate limited" })],
				configError: null,
			},
		})
		expect(rows.map((row) => row._tag)).toEqual(["section", "pull-request", "section", "section", "message"])
		expect(rows[1]).toMatchObject({ _tag: "pull-request", showRepository: true })
		expect(rows.at(-1)).toMatchObject({ _tag: "message", text: "  ! rate limited" })
		expect(pullRequestListRowIndex(rows, first.url)).toBe(1)
		expect(pullRequestListRowIndex(rows, second.url)).toBeNull()
		expect(pullRequestListVisualLineCount(rows)).toBe(6)
	})

	test("shows the config error above the default sections", () => {
		const rows = buildPullRequestListRows({
			...base,
			groups: [["mine", [second]]],
			sections: { headers: [header("mine", { count: 1 })], configError: "sections.yaml: bad" },
		})
		expect(rows[0]).toMatchObject({ _tag: "message", text: "! sections.yaml: bad (using defaults)" })
		expect(rows[1]).toMatchObject({ _tag: "section", section: { id: "mine" } })
	})

	test("reports loading before the first section snapshot and empty filter results", () => {
		expect(buildPullRequestListRows({ ...base, status: "loading", groups: [], sections: { headers: [], configError: null } })).toEqual([
			{ _tag: "message", text: "- Loading sections...", color: expect.any(String) },
		])
		const filtered = buildPullRequestListRows({ ...base, filterText: "zzz", groups: [], sections: { headers: [header("mine")], configError: null } })
		expect(filtered.map((row) => row._tag)).toEqual(["message", "section"])
	})
})
