import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import type { PullRequestItem } from "../src/domain.ts"
import type { RiskBrief } from "../src/review/briefSchema.ts"
import { briefStatusFor, reviewEntryFromRecord, reviewKey, type ReviewEntry } from "../src/review/briefStatus.ts"
import type { AgentReviewRecord } from "../src/review/types.ts"
import { BriefPane } from "../src/ui/review/BriefPane.tsx"
import { LiveText } from "../src/ui/review/LiveText.tsx"
import { briefViewRows, focusRowSpan, resolveBriefDiffTarget, scrollToKeepVisible } from "../src/ui/review/briefViewRows.ts"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const pullRequest: PullRequestItem = {
	repository: "owner/repo",
	author: "someone",
	headRefOid: "feedface00",
	headRefName: "feature/x",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 7,
	title: "Add a thing",
	body: "",
	labels: [],
	additions: 3,
	deletions: 1,
	changedFiles: 2,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/7",
}

const brief: RiskBrief = {
	risk: "high",
	summary: "Reworks the session cache eviction path.",
	before_after: "Before: entries lived forever. After: evicted after ten minutes.",
	focus_areas: [
		{ file: "src/cache.ts", lines: "40-58", why: "Eviction races with reads.", severity: "high" },
		{ file: "src/config.ts", lines: null, why: "New default TTL.", severity: "low" },
	],
	safe_to_skip: [{ path: "test/fixtures.json", why: "Generated fixtures." }],
	questions: ["Should the TTL be configurable per tenant?"],
	tests: "Adds unit tests for eviction; no race test.",
	confidence: "medium",
}

const record = (overrides: Partial<AgentReviewRecord> = {}): AgentReviewRecord => ({
	id: "run-1",
	repository: pullRequest.repository,
	number: pullRequest.number,
	headSha: "deadbeef99",
	preset: "deep",
	agent: "claude",
	status: "done",
	mode: "worktree",
	briefJson: JSON.stringify(brief),
	error: null,
	logPath: "/tmp/prs-reviews/run-1.log",
	costUsd: 0.42,
	startedAt: new Date("2026-01-01T00:00:00Z"),
	finishedAt: new Date("2026-01-01T00:01:05Z"),
	...overrides,
})

const statusOf = (entry: ReviewEntry) => briefStatusFor({ [reviewKey(entry.record.repository, entry.record.number)]: entry }, pullRequest)
const now = new Date("2026-01-01T00:02:00Z")

const renderPane = async (entry: ReviewEntry, width = 90, height = 48) => {
	const status = statusOf(entry)
	const rows = briefViewRows({ status, entry, headRefOid: pullRequest.headRefOid, width: width - 2, now })
	const setup = await createTestRenderer({ width, height })
	const root = createRoot(setup.renderer)
	act(() => {
		root.render(<BriefPane pullRequest={pullRequest} status={status} rows={rows} focusIndex={0} scrollTop={0} contentWidth={width - 2} height={height} />)
	})
	await setup.renderOnce()
	const frame = setup.captureCharFrame()
	act(() => root.unmount())
	setup.renderer.destroy()
	return frame
}

describe("brief view", () => {
	test("a finished brief renders every field", async () => {
		const frame = await renderPane(reviewEntryFromRecord(record()))
		for (const expected of [
			"repo #7 · agent review",
			"Risk HIGH · confidence medium · stale",
			"Summary",
			"Reworks the session cache eviction path.",
			"Before / after",
			"evicted after ten minutes",
			"Focus areas (2) · enter opens the diff",
			"high src/cache.ts:40-58",
			"Eviction races with reads.",
			"low  src/config.ts",
			"Safe to skip (1)",
			"test/fixtures.json — Generated fixtures.",
			"Questions",
			"• Should the TTL be configurable per tenant?",
			"Tests",
			"no race test",
			"Preset    deep · claude · worktree",
			"Cost      $0.42",
			"Duration  1m5s",
			"Head      deadbee",
			"Stale     PR head moved to feedfac; press b to re-run",
			"Log       /tmp/prs-reviews/run-1.log",
		])
			expect(frame).toContain(expected)
	})

	test("the running elapsed time is a live segment that ticks on its own", async () => {
		const entry = reviewEntryFromRecord(record({ status: "running", briefJson: null, finishedAt: null }))
		const rows = briefViewRows({ status: statusOf(entry), entry, headRefOid: pullRequest.headRefOid, width: 88, now })
		const segment = rows[0]!.segments.find((candidate) => candidate.live)!
		expect(segment.text).toBe(" · 2m elapsed")
		expect(segment.live!(new Date(now.getTime() + 65_000))).toBe(" · 3m5s elapsed")

		const setup = await createTestRenderer({ width: 20, height: 1 })
		const root = createRoot(setup.renderer)
		let ticks = 0
		act(() => {
			root.render(
				<text>
					<LiveText text="start" fg="#ffffff" live={() => `tick ${++ticks}`} intervalMs={10} />
				</text>,
			)
		})
		await setup.renderOnce()
		const first = setup.captureCharFrame()
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 35))
		})
		await setup.renderOnce()
		const later = setup.captureCharFrame()
		act(() => root.unmount())
		setup.renderer.destroy()
		expect(first).toContain("start")
		expect(later).toContain("tick")
	})

	test("idle, running and error states", async () => {
		const idle = await renderPane({ record: record({ status: "cancelled", briefJson: null }), brief: null })
		expect(idle).toContain("No agent review yet")
		expect(idle).toContain("The last review was cancelled.")
		expect(idle).toContain("run a read-only review with the default preset")

		const running = await renderPane(reviewEntryFromRecord(record({ status: "running", briefJson: null, finishedAt: null })))
		expect(running).toContain("⠋ running")
		expect(running).toContain("Agent review running · 2m elapsed")
		expect(running).toContain("cancel the review")
		expect(running).toMatch(/L +open the log/)
		expect(running).toContain("/tmp/prs-reviews/run-1.log")

		const failed = await renderPane(reviewEntryFromRecord(record({ status: "error", briefJson: null, error: "agent exited with code 1" })))
		expect(failed).toContain("Agent review failed")
		expect(failed).toContain("agent exited with code 1")
		expect(failed).toContain("Log       /tmp/prs-reviews/run-1.log")
	})

	test("rows never exceed the content width", () => {
		const entry = reviewEntryFromRecord(record())
		for (const width of [30, 60]) {
			const rows = briefViewRows({ status: statusOf(entry), entry, headRefOid: pullRequest.headRefOid, width, now })
			for (const row of rows) expect(row.segments.map((segment) => segment.text).join("").length).toBeLessThanOrEqual(width)
		}
	})

	test("focus spans cover the header and wrapped reason; scrolling keeps them visible", () => {
		const entry = reviewEntryFromRecord(record())
		const rows = briefViewRows({ status: statusOf(entry), entry, headRefOid: pullRequest.headRefOid, width: 20, now })
		const span = focusRowSpan(rows, 0)!
		expect(span[1]).toBeGreaterThan(span[0])
		expect(focusRowSpan(rows, 5)).toBeNull()
		expect(scrollToKeepVisible(0, 5, 10, 12)).toBe(8)
		expect(scrollToKeepVisible(11, 5, 10, 12)).toBe(10)
		expect(scrollToKeepVisible(9, 5, 10, 12)).toBe(9)
	})

	test("focus areas resolve to a diff file and the nearest new-side line", () => {
		const files = [{ name: "README.md" }, { name: "src/cache.ts" }, { name: "packages/core/src/config.ts" }]
		const anchors = [
			{ fileIndex: 1, line: 30, side: "RIGHT" as const },
			{ fileIndex: 1, line: 44, side: "LEFT" as const },
			{ fileIndex: 1, line: 42, side: "RIGHT" as const },
			{ fileIndex: 1, line: 50, side: "RIGHT" as const },
			{ fileIndex: 2, line: 1, side: "RIGHT" as const },
		]
		expect(resolveBriefDiffTarget({ file: "src/cache.ts", lines: "40-58" }, files, anchors)).toEqual({ fileIndex: 1, anchorIndex: 2 })
		expect(resolveBriefDiffTarget({ file: "./b/src/cache.ts", lines: "L41" }, files, anchors)).toEqual({ fileIndex: 1, anchorIndex: 2 })
		expect(resolveBriefDiffTarget({ file: "src/cache.ts", lines: "900" }, files, anchors)).toEqual({ fileIndex: 1, anchorIndex: null })
		expect(resolveBriefDiffTarget({ file: "src/config.ts", lines: null }, files, anchors)).toEqual({ fileIndex: 2, anchorIndex: null })
		expect(resolveBriefDiffTarget({ file: "src/missing.ts", lines: "1" }, files, anchors)).toBeNull()
	})
})
