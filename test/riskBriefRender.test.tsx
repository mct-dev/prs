import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import type { PullRequestItem } from "../src/domain.ts"
import type { BriefStatus } from "../src/review/briefStatus.ts"
import { DetailHeader, getDetailHeaderHeight, getDetailJunctionRows } from "../src/ui/DetailsPane.tsx"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const pullRequest: PullRequestItem = {
	repository: "owner/repo",
	author: "someone",
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
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [{ name: "test", status: "completed", conclusion: "success" }],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/7",
}

const done: BriefStatus = {
	_tag: "done",
	brief: {
		risk: "medium",
		summary: "Moves config loading behind a service.",
		focus_areas: [
			{ file: "src/config.ts", lines: "10-40", why: "new fallback path", severity: "medium" },
			{ file: "src/app.ts", lines: null, why: "wiring", severity: "low" },
		],
		safe_to_skip: [],
		questions: [],
		confidence: "high",
	},
	stale: true,
	costUsd: 0.1,
	headSha: "old",
}

const renderHeader = async (brief: BriefStatus | null, width = 60, showChecks = true) => {
	const height = getDetailHeaderHeight(pullRequest, width, showChecks, [], "idle", brief)
	const setup = await createTestRenderer({ width, height: height + 2 })
	const root = createRoot(setup.renderer)
	act(() => {
		root.render(
			<box flexDirection="column" width={width}>
				<DetailHeader pullRequest={pullRequest} contentWidth={width - 2} paneWidth={width} loadingIndicator="" showChecks={showChecks} brief={brief} />
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

describe("risk brief rendering", () => {
	test("divider rows match the computed junction rows", async () => {
		for (const showChecks of [true, false]) {
			for (const brief of [null, { _tag: "idle" } as const, done]) {
				const { lines, height } = await renderHeader(brief, 60, showChecks)
				expect(dividerRows(lines)).toEqual([...getDetailJunctionRows({ pullRequest, paneWidth: 60, showChecks, brief })])
				// Nothing is rendered below the computed header height.
				expect(lines.slice(height).every((line) => line.trim() === "")).toBe(true)
			}
		}
	})

	test("renders risk, stale flag and focus areas", async () => {
		const { lines } = await renderHeader(done)
		const frame = lines.join("\n")
		expect(frame).toContain("Risk brief · MEDIUM · stale · $0.10")
		expect(frame).toContain("src/config.ts:10-40 — new fallback path")
		expect(frame).toContain("src/app.ts — wiring")
	})

	test("the brief shows even when checks are hidden", async () => {
		const { lines } = await renderHeader(done, 60, false)
		expect(lines.join("\n")).toContain("Risk brief · MEDIUM")
	})

	test("idle state shows the run hint", async () => {
		const { lines } = await renderHeader({ _tag: "idle" })
		expect(lines.join("\n")).toContain("b run agent review · B pick preset · v brief view")
	})
})
