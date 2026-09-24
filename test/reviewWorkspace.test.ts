import { describe, expect, test } from "bun:test"
import { briefFilterValue, briefRisk, briefStatusFor, reviewEntryFromRecord, reviewKey, type ReviewIndex } from "../src/review/briefStatus.ts"
import type { AgentReviewRecord } from "../src/review/types.ts"
import { filesFromDiff, pickRemote, worktreeDirName } from "../src/review/workspace.ts"

describe("workspace helpers", () => {
	test("worktreeDirName is filesystem safe and includes sha7 and preset", () => {
		expect(worktreeDirName("owner/repo", 12, "abcdef1234", "claude")).toBe("owner-repo-12-abcdef1-claude")
		expect(worktreeDirName("o/r", 1, "abcdef1", "my plugin:review")).toBe("o-r-1-abcdef1-my-plugin-review")
	})

	test("pickRemote prefers the remote pointing at the PR repository", () => {
		const remotes = ["origin\tgit@github.com:me/repo.git (fetch)", "origin\tgit@github.com:me/repo.git (push)", "upstream\thttps://github.com/Owner/Repo.git (fetch)"].join("\n")
		expect(pickRemote(remotes, "owner/repo")).toBe("upstream")
		expect(pickRemote(remotes, "other/thing")).toBe("origin")
		expect(pickRemote("", "owner/repo")).toBe("origin")
	})

	test("filesFromDiff reads diff --git headers", () => {
		const diff = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "diff --git a/old.ts b/new.ts", "rename from old.ts"].join("\n")
		expect(filesFromDiff(diff)).toEqual(["src/a.ts", "new.ts"])
	})
})

const record = (overrides: Partial<AgentReviewRecord> = {}): AgentReviewRecord => ({
	id: "run",
	repository: "owner/repo",
	number: 1,
	headSha: "aaa",
	preset: "claude",
	agent: "claude",
	status: "done",
	mode: "worktree",
	briefJson: JSON.stringify({ risk: "high", summary: "s", focus_areas: [], safe_to_skip: [], questions: [], confidence: "low" }),
	error: null,
	logPath: null,
	costUsd: 0.5,
	startedAt: new Date("2026-01-01T00:00:00Z"),
	finishedAt: new Date("2026-01-01T00:01:00Z"),
	...overrides,
})

const indexOf = (value: AgentReviewRecord): ReviewIndex => ({ [reviewKey(value.repository, value.number)]: reviewEntryFromRecord(value) })
const pr = { repository: "owner/repo", number: 1, headRefOid: "aaa" }

describe("briefStatusFor", () => {
	test("idle when there is no run", () => {
		expect(briefStatusFor({}, pr)).toEqual({ _tag: "idle" })
		expect(briefFilterValue(briefStatusFor({}, pr))).toBe("none")
	})

	test("done and fresh when the head matches", () => {
		const status = briefStatusFor(indexOf(record()), pr)
		expect(status).toMatchObject({ _tag: "done", stale: false, costUsd: 0.5 })
		expect(briefFilterValue(status)).toBe("done")
		expect(briefRisk(status)).toBe("high")
	})

	test("stale when the PR head moved", () => {
		const status = briefStatusFor(indexOf(record()), { ...pr, headRefOid: "bbb" })
		expect(status).toMatchObject({ _tag: "done", stale: true })
		expect(briefFilterValue(status)).toBe("stale")
	})

	test("running, error, cancelled, and corrupt briefs", () => {
		expect(briefStatusFor(indexOf(record({ status: "running", briefJson: null })), pr)._tag).toBe("running")
		expect(briefStatusFor(indexOf(record({ status: "error", error: "boom", briefJson: null })), pr)).toEqual({ _tag: "error", message: "boom", stale: false })
		expect(briefStatusFor(indexOf(record({ status: "cancelled", briefJson: null })), pr)._tag).toBe("idle")
		expect(briefStatusFor(indexOf(record({ briefJson: '{"risk":"nope"}' })), pr)._tag).toBe("error")
	})
})
