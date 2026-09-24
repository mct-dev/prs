import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import type { PullRequestItem } from "../src/domain.ts"
import type { RiskBrief } from "../src/review/briefSchema.ts"
import type { BriefStatus } from "../src/review/briefStatus.ts"
import { colors } from "../src/ui/colors.ts"
import { getRowLayout, PullRequestList } from "../src/ui/PullRequestList.tsx"
import { briefGlyph } from "../src/ui/review/briefDisplay.ts"
import { BriefSpinner } from "../src/ui/review/BriefSpinner.tsx"
import { SPINNER_INTERVAL_MS } from "../src/ui/spinner.ts"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const brief = (risk: RiskBrief["risk"]): RiskBrief => ({ risk, summary: "s", focus_areas: [], safe_to_skip: [], questions: [], confidence: "high" })
const done = (risk: RiskBrief["risk"], stale = false): BriefStatus => ({ _tag: "done", brief: brief(risk), stale, costUsd: null, headSha: "abc" })

const pullRequest = (number: number): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: "abc",
	headRefName: `feature/${number}`,
	baseRefName: "main",
	defaultBranchName: "main",
	number,
	title: `A fairly long pull request title number ${number} that must truncate`,
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
	url: `https://github.com/owner/repo/pull/${number}`,
})

describe("brief glyph", () => {
	test("one marker per brief state", () => {
		expect(briefGlyph({ _tag: "idle" })).toEqual({ text: " ", fg: colors.muted })
		expect(briefGlyph({ _tag: "running", startedAt: new Date(0), runId: "r" })).toEqual({ text: "⠋", fg: colors.status.pending })
		expect(briefGlyph({ _tag: "error", message: "boom", stale: false })).toEqual({ text: "!", fg: colors.status.failing })
		expect(briefGlyph(done("low"))).toEqual({ text: "●", fg: colors.status.passing })
		expect(briefGlyph(done("medium"))).toEqual({ text: "●", fg: colors.status.pending })
		expect(briefGlyph(done("high"))).toEqual({ text: "●", fg: colors.status.failing })
		expect(briefGlyph(done("high", true))).toEqual({ text: "○", fg: colors.muted })
	})

	test("the glyph column is taken from the title, not added past the row", () => {
		const plain = getRowLayout(40, 3, 3)
		const withBrief = getRowLayout(40, 3, 3, true)
		expect(withBrief.briefWidth).toBe(2)
		expect(withBrief.titleWidth).toBe(plain.titleWidth - 2)
	})

	const statuses: Record<number, BriefStatus> = {
		1: { _tag: "idle" },
		2: { _tag: "running", startedAt: new Date(0), runId: "r" },
		3: done("high"),
		4: done("low", true),
		5: { _tag: "error", message: "boom", stale: false },
	}

	for (const width of [60, 24]) {
		test(`rows render every glyph and stay within ${width} columns`, async () => {
			const setup = await createTestRenderer({ width, height: 8 })
			const root = createRoot(setup.renderer)
			act(() => {
				root.render(
					<PullRequestList
						groups={[["owner/repo", [1, 2, 3, 4, 5].map(pullRequest)]]}
						selectedUrl={null}
						status="ready"
						error={null}
						contentWidth={width}
						filterText=""
						loadedCount={5}
						hasMore={false}
						isLoadingMore={false}
						loadingIndicator="⠋"
						onSelectPullRequest={() => {}}
						showTitle={false}
						showRepositoryGroups={false}
						compact
						briefStatusOf={(pr) => statuses[pr.number]!}
					/>,
				)
			})
			await setup.renderOnce()
			const lines = setup
				.captureCharFrame()
				.split("\n")
				.filter((line) => line.includes("#"))
			act(() => root.unmount())
			setup.renderer.destroy()
			expect(lines).toHaveLength(5)
			const glyphs = lines.map((line) => line.trimEnd().at(-1))
			// Idle leaves the cell blank, so its row ends on the check column instead.
			expect(glyphs.slice(1)).toEqual(["⠋", "●", "○", "!"])
			expect(lines[0]!.trimEnd().endsWith("·")).toBe(true)
			for (const line of lines) expect(line.length).toBeLessThanOrEqual(width)
		})
	}

	test("the running spinner animates on its own interval", async () => {
		const setup = await createTestRenderer({ width: 4, height: 1 })
		const root = createRoot(setup.renderer)
		act(() => {
			root.render(
				<text>
					<BriefSpinner fg={colors.status.pending} width={2} />
				</text>,
			)
		})
		await setup.renderOnce()
		const first = setup.captureCharFrame()
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, SPINNER_INTERVAL_MS * 2.5))
		})
		await setup.renderOnce()
		const later = setup.captureCharFrame()
		act(() => root.unmount())
		setup.renderer.destroy()
		expect(first).toContain(" ⠋")
		expect(later).not.toContain("⠋")
	})
})
