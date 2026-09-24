import { describe, expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import type { ItemPage } from "../src/item.ts"
import type { PullRequestLoad } from "../src/pullRequestLoad.ts"
import { nextLoadAfterPage } from "../src/pullRequestCache.ts"

const samplePullRequest = (number: number): PullRequestItem => ({
	repository: "anomalyco/opencode",
	author: "kit",
	headRefOid: `oid-${number}`,
	headRefName: `branch-${number}`,
	baseRefName: "main",
	defaultBranchName: "main",
	number,
	title: `PR #${number}`,
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
	createdAt: new Date(`2026-01-${String(number).padStart(2, "0")}T00:00:00Z`),
	updatedAt: new Date(`2026-01-${String(number).padStart(2, "0")}T00:00:00Z`),
	closedAt: null,
	url: `https://github.com/anomalyco/opencode/pull/${number}`,
})

const buildPage = (items: readonly PullRequestItem[], endCursor: string | null, hasNextPage: boolean): ItemPage<PullRequestItem> => ({
	items,
	endCursor,
	hasNextPage,
})

const buildLoad = (items: readonly PullRequestItem[], endCursor: string | null, hasNextPage: boolean): PullRequestLoad => ({
	view: { _tag: "Repository", repository: "anomalyco/opencode" },
	data: items,
	fetchedAt: new Date("2026-05-12T00:00:00Z"),
	endCursor,
	hasNextPage,
})

describe("nextLoadAfterPage", () => {
	test("appends new items and keeps pagination open when server reports more", () => {
		const current = buildLoad([samplePullRequest(1), samplePullRequest(2)], "cursor-1", true)
		const page = buildPage([samplePullRequest(3), samplePullRequest(4)], "cursor-2", true)

		const next = nextLoadAfterPage(current, page, 200)

		expect(next.data.map((pr) => pr.number)).toEqual([1, 2, 3, 4])
		expect(next.endCursor).toBe("cursor-2")
		expect(next.hasNextPage).toBe(true)
	})

	test("keeps hasNextPage true when an entire page is duplicates but the cursor advanced", () => {
		// Regression: the old code gated hasNextPage on `addedItems > 0`,
		// which permanently killed pagination if GitHub returned a window
		// of dupes (concurrent updates, sort drift). The cursor moved, so
		// the *next* fetch would return fresh items — but we never got
		// there. The list dead-ended at the current count.
		const current = buildLoad([samplePullRequest(1), samplePullRequest(2)], "cursor-1", true)
		const allDupes = buildPage([samplePullRequest(1), samplePullRequest(2)], "cursor-2", true)

		const next = nextLoadAfterPage(current, allDupes, 200)

		expect(next.data.map((pr) => pr.number)).toEqual([1, 2])
		expect(next.endCursor).toBe("cursor-2")
		expect(next.hasNextPage).toBe(true)
	})

	test("stops paginating when the cursor stalls", () => {
		const current = buildLoad([samplePullRequest(1)], "cursor-stuck", true)
		const stalled = buildPage([samplePullRequest(1)], "cursor-stuck", true)

		const next = nextLoadAfterPage(current, stalled, 200)

		expect(next.hasNextPage).toBe(false)
	})

	test("stops paginating when the server reports no more", () => {
		const current = buildLoad([samplePullRequest(1)], "cursor-1", true)
		const last = buildPage([samplePullRequest(2)], "cursor-2", false)

		const next = nextLoadAfterPage(current, last, 200)

		expect(next.hasNextPage).toBe(false)
	})

	test("stops paginating once prFetchLimit is reached", () => {
		const items = Array.from({ length: 50 }, (_, i) => samplePullRequest(i + 1))
		const current = buildLoad(items, "cursor-49", true)
		const overflow = buildPage([samplePullRequest(60), samplePullRequest(61)], "cursor-50", true)

		const next = nextLoadAfterPage(current, overflow, 50)

		expect(next.data.length).toBeGreaterThanOrEqual(50)
		expect(next.hasNextPage).toBe(false)
	})

	test("updates fetchedAt to the moment the page landed", () => {
		const current = buildLoad([], null, true)
		const page = buildPage([samplePullRequest(1)], "cursor-1", true)
		const landedAt = new Date("2026-06-01T12:34:56Z")

		const next = nextLoadAfterPage(current, page, 200, landedAt)

		expect(next.fetchedAt).toEqual(landedAt)
	})
})
