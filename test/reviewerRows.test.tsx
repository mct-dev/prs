import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import type { PullRequestItem, PullRequestReviewer, PullRequestReviewers } from "../src/domain.ts"
import { DetailHeader, getDetailHeaderHeight, getDetailJunctionRows } from "../src/ui/DetailsPane.tsx"
import { reviewerRows } from "../src/ui/reviewerRows.ts"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const base: PullRequestItem = {
	repository: "my-org/app",
	author: "alice",
	headRefOid: "abc123",
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
	reviewStatus: "review",
	checkStatus: "none",
	checkSummary: null,
	checks: [{ name: "test", status: "completed", conclusion: "success" }],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/my-org/app/pull/7",
}

const reviewer = (login: string, state: PullRequestReviewer["state"], extra: Partial<PullRequestReviewer> = {}): PullRequestReviewer => ({
	kind: "user",
	login,
	state,
	codeOwner: false,
	isViewer: false,
	...extra,
})

const withReviewers = (reviewers: readonly PullRequestReviewer[], requiredApprovals: number | null = null): PullRequestItem => ({
	...base,
	reviewers: { reviewers, requiredApprovals } satisfies PullRequestReviewers,
})

const text = (pullRequest: PullRequestItem, width: number) => reviewerRows(pullRequest, width).map((row) => row.map((segment) => segment.text).join(""))

const mixed = withReviewers(
	[
		reviewer("alice", "approved"),
		reviewer("bob", "changes"),
		reviewer("carol", "commented", { isViewer: true }),
		reviewer("my-org/platform", "requested", { kind: "team", codeOwner: true }),
		reviewer("dave", "dismissed"),
	],
	2,
)

describe("reviewer rows", () => {
	test("no rows until the detail query has filled reviewers", () => {
		expect(reviewerRows(base, 60)).toEqual([])
		expect(reviewerRows({ ...mixed, detailLoaded: false }, 60)).toEqual([])
	})

	test("an empty list says so and falls back to the review decision", () => {
		expect(text(withReviewers([]), 60)).toEqual(["Reviewers · review required  none requested"])
	})

	test("glyphs, owner and viewer marks, and required approvals", () => {
		expect(text(mixed, 100)).toEqual(["Reviewers · 1/2 approvals  ✓ alice  ! bob  ◇ carol (you)  ◐ my-org/platform (owner)  − dave"])
	})

	test("wraps to a second row, then collapses the rest into +N more", () => {
		const many = withReviewers(["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy"].map((login) => reviewer(login, "requested")))
		const rows = text(many, 40)
		expect(rows).toEqual(["Reviewers · review required  ◐ alice", "           ◐ bob  ◐ carol  +7 more"])
		for (const row of rows) expect(row.length).toBeLessThanOrEqual(40)
	})

	test("never exceeds narrow widths", () => {
		for (const width of [8, 12, 20, 28]) {
			const rows = text(mixed, width)
			expect(rows.length).toBeLessThanOrEqual(2)
			for (const row of rows) expect(row.length).toBeLessThanOrEqual(width)
		}
	})
})

const renderHeader = async (pullRequest: PullRequestItem, width: number, showChecks: boolean) => {
	const height = getDetailHeaderHeight(pullRequest, width, showChecks)
	const setup = await createTestRenderer({ width, height: height + 2 })
	const root = createRoot(setup.renderer)
	act(() => {
		root.render(
			<box flexDirection="column" width={width}>
				<DetailHeader pullRequest={pullRequest} contentWidth={width - 2} paneWidth={width} loadingIndicator="" showChecks={showChecks} />
			</box>,
		)
	})
	await setup.renderOnce()
	const lines = setup.captureCharFrame().split("\n")
	act(() => root.unmount())
	setup.renderer.destroy()
	return { lines, height }
}

const dividerRows = (lines: readonly string[]) => lines.flatMap((line, index) => (line.trim().startsWith("─") ? [index] : []))

describe("reviewers in the detail header", () => {
	test("rendered rows match the computed height and junction rows", async () => {
		for (const pullRequest of [base, withReviewers([]), mixed]) {
			for (const width of [30, 60, 120]) {
				for (const showChecks of [true, false]) {
					const { lines, height } = await renderHeader(pullRequest, width, showChecks)
					expect(dividerRows(lines)).toEqual([...getDetailJunctionRows({ pullRequest, paneWidth: width, showChecks })])
					expect(lines[height - 1]?.trim().startsWith("─")).toBe(true)
					expect(lines.slice(height).every((line) => line.trim() === "")).toBe(true)
				}
			}
		}
	})

	test("the reviewers row sits above the header divider", async () => {
		const { lines } = await renderHeader(mixed, 120, true)
		const row = lines.findIndex((line) => line.includes("Reviewers"))
		expect(row).toBeGreaterThan(0)
		expect(lines[row]).toContain("✓ alice")
		expect(dividerRows(lines)[0]).toBe(row + 1)
	})
})
