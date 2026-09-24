import { describe, expect, test } from "bun:test"
import type { PullRequestComment, PullRequestItem } from "../src/domain.ts"
import type { BriefStatus } from "../src/review/briefStatus.ts"
import { bodyPreview, getDetailHeaderHeight, getDetailJunctionRows, getScrollableDetailBodyHeight, riskBriefRows, truncateConversationPath } from "../src/ui/DetailsPane.tsx"
import { diffStatText } from "../src/ui/diff.ts"

const pullRequest = (body: string): PullRequestItem => ({
	repository: "owner/repo",
	author: "kitlangton",
	headRefOid: "abc123",
	headRefName: "feature/title",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 1,
	title: "Title",
	body,
	labels: [],
	additions: 1,
	deletions: 1,
	changedFiles: 1,
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
	url: "https://github.com/owner/repo/pull/1",
})

describe("diffStatText", () => {
	test("uses the active spinner frame while details load", () => {
		expect(diffStatText({ ...pullRequest(""), detailLoaded: false }, "⠹")).toBe("⠹ Loading details")
	})
})

describe("truncateConversationPath", () => {
	test("preserves package and repository segments plus the filename", () => {
		expect(truncateConversationPath("packages/opencode/src/project/bootstrap-service.ts", 45)).toBe("packages/opencode/…/bootstrap-service.ts")
	})

	test("keeps useful trailing directories when they fit", () => {
		expect(truncateConversationPath("packages/opencode/src/project/bootstrap-service.ts", 48)).toBe("packages/opencode/…/project/bootstrap-service.ts")
	})

	test("keeps narrow paths inside the target width", () => {
		const truncated = truncateConversationPath("very-long-top-level-directory/src/file.ts", 12)
		expect(truncated).toHaveLength(12)
		expect(truncated).toBe("…src/file.ts")
	})
})

describe("bodyPreview markdown tables", () => {
	const lineText = (line: ReturnType<typeof bodyPreview>[number]) => line.segments.map((segment) => segment.text).join("")

	test("renders pipe tables without raw markdown separator rows", () => {
		const rows = bodyPreview("| Consumer | Sketch accommodation |\n|---|---|\n| `Session.Service.get` | **typed errors** |", 80, 10)
		const text = rows.map(lineText)

		expect(text[0]).toContain("Consumer")
		expect(text[0]).toContain("Sketch accommodation")
		expect(text[1]).toContain("─┼─")
		expect(text).not.toContain("|---|---|")
		expect(text.join("\n")).toContain("Session.Service.get")
		expect(text.join("\n")).not.toContain("`Session.Service.get`")
		expect(text.join("\n")).not.toContain("**typed errors**")
	})

	test("only parses tables with a separator row", () => {
		const rows = bodyPreview("A | B\nnot a table", 40, 10)
		expect(rows.map(lineText)).toEqual(["A | B", "not a table"])
	})

	test("can truncate table cells instead of wrapping them", () => {
		const rows = bodyPreview("| MCP Server Type | Instances | Process |\n|---|---|---|\n| zai-mcp-server node.exe (via npx) | 10x | cmd.exe -> node.exe |", 42, 10, {
			tableMode: "truncate",
		})
		const text = rows.map(lineText)

		expect(text.slice(0, 3)).toHaveLength(3)
		expect(text[0]).toContain("MCP Server …")
		expect(text[2]).toContain("zai-mcp-ser…")
		expect(text.join("\n")).not.toContain("node.exe (via npx)\n")
	})
})

const comments: readonly PullRequestComment[] = [
	{
		_tag: "comment",
		id: "comment-1",
		author: "kitlangton",
		body: "hello",
		createdAt: new Date("2026-01-01T01:00:00Z"),
		url: null,
	},
]

describe("detail pane junction rows", () => {
	test("keeps comments in the metadata row without adding dividers", () => {
		const pr = pullRequest("Line A\nLine B\nLine C")
		const headerDividerRow = 3

		expect(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, comments, commentsStatus: "ready" })).toEqual([headerDividerRow])
	})

	test("does not reserve comments space while loading or empty", () => {
		const pr = pullRequest("Line A\nLine B")
		const baseJunctionRows = getDetailJunctionRows({ pullRequest: pr, paneWidth: 60 })
		const baseBodyHeight = getScrollableDetailBodyHeight(pr, 58)

		expect(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, comments: [], commentsStatus: "loading" })).toEqual(baseJunctionRows)
		expect(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, comments: [], commentsStatus: "ready" })).toEqual(baseJunctionRows)
		expect(getScrollableDetailBodyHeight(pr, 58)).toBe(baseBodyHeight)
	})

	test("comment metadata does not grow header or body height", () => {
		const pr = pullRequest("Line A\nLine B")
		const baseHeaderHeight = getDetailHeaderHeight(pr, 60, true)
		const baseBodyHeight = getScrollableDetailBodyHeight(pr, 58)

		expect(getDetailHeaderHeight(pr, 60, true, comments, "ready")).toBe(baseHeaderHeight)
		expect(getScrollableDetailBodyHeight(pr, 58)).toBe(baseBodyHeight)
	})
})

describe("risk brief block", () => {
	const brief = (focusCount: number, summary = "Adds a cache layer for PR details."): BriefStatus => ({
		_tag: "done",
		brief: {
			risk: "high",
			summary,
			focus_areas: Array.from({ length: focusCount }, (_, index) => ({
				file: `src/file${index}.ts`,
				lines: `${index + 1}-${index + 9}`,
				why: "touches invalidation",
				severity: "high" as const,
			})),
			safe_to_skip: [],
			questions: [],
			confidence: "medium",
		},
		stale: false,
		costUsd: 0.42,
		headSha: "abc123",
	})
	const rowText = (row: ReturnType<typeof riskBriefRows>[number]) => row.map((segment) => segment.text).join("")

	test("idle, running and error states take a heading plus one row", () => {
		expect(riskBriefRows({ _tag: "idle" }, 58).map(rowText)[1]?.trim()).toBe("b: run agent review")
		expect(rowText(riskBriefRows({ _tag: "running", startedAt: new Date(), runId: "r1" }, 58)[0]!)).toContain("running…")
		const error = riskBriefRows({ _tag: "error", message: "agent exited\nwith 1", stale: true }, 58)
		expect(error).toHaveLength(2)
		expect(rowText(error[0]!)).toContain("stale")
		expect(rowText(error[1]!).trim()).toBe("agent exited with 1")
	})

	test("done shows risk, summary, up to three focus areas and a +N more row", () => {
		const rows = riskBriefRows(brief(5), 58).map(rowText)
		expect(rows[0]).toBe("Risk brief · HIGH · $0.42")
		expect(rows[1]).toBe("Adds a cache layer for PR details.")
		expect(rows[2]?.trim()).toBe("src/file0.ts:1-9 — touches invalidation")
		expect(rows.slice(2, 5)).toHaveLength(3)
		expect(rows[5]).toBe("+2 more")
		expect(rows).toHaveLength(6)
		expect(riskBriefRows(brief(2), 58)).toHaveLength(4)
	})

	test("stale flag and long summaries are clamped to two lines", () => {
		const status = { ...brief(0, "word ".repeat(60)), stale: true } as BriefStatus
		const rows = riskBriefRows(status, 30).map(rowText)
		expect(rows[0]).toContain("stale")
		expect(rows).toHaveLength(3)
		expect(rows[2]?.endsWith("…")).toBe(true)
		for (const row of rows.slice(1)) expect(row.length).toBeLessThanOrEqual(30)
	})

	test("adds rows and a closing divider only where checks are shown", () => {
		const pr = pullRequest("Line A")
		const status = brief(5)
		const briefRowCount = riskBriefRows(status, 58).length
		const base = getDetailHeaderHeight(pr, 60, true)
		const baseJunctions = getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, showChecks: true })

		expect(getDetailHeaderHeight(pr, 60, true, [], "idle", status)).toBe(base + briefRowCount + 1)
		expect(getDetailHeaderHeight(pr, 60, false, [], "idle", status)).toBe(getDetailHeaderHeight(pr, 60, false))
		expect(getDetailHeaderHeight(pr, 60, true, [], "idle", null)).toBe(base)

		const junctions = getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, showChecks: true, brief: status })
		expect(junctions.slice(0, baseJunctions.length)).toEqual(baseJunctions)
		// Last divider closes the header, so it is the final header row.
		expect(junctions[junctions.length - 1]).toBe(base + briefRowCount)
		expect(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60, showChecks: false, brief: status })).toEqual(getDetailJunctionRows({ pullRequest: pr, paneWidth: 60 }))
	})
})
