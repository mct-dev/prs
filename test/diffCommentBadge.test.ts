import { describe, expect, test } from "bun:test"
import type { PullRequestReviewComment } from "../src/domain.ts"
import { diffCommentBadge, diffThreadCounts } from "../src/ui/diff/commentBadge.ts"

const comment = (path: string, line: number): PullRequestReviewComment => ({
	id: `${path}:${line}`,
	path,
	line,
	side: "RIGHT",
	author: "reviewer",
	body: "Looks fine.",
	createdAt: null,
	url: null,
	inReplyTo: null,
})

describe("diff comment badges", () => {
	test("counts threads, not comments, per file of the selected diff only", () => {
		const threads = {
			"owner/repo#1@a:src/one.ts:RIGHT:3": [comment("src/one.ts", 3), comment("src/one.ts", 3)],
			"owner/repo#1@a:src/one.ts:RIGHT:9": [comment("src/one.ts", 9)],
			"owner/repo#1@a:src/two.ts:RIGHT:0": [comment("src/two.ts", 0)],
			"owner/repo#2@b:src/one.ts:RIGHT:3": [comment("src/one.ts", 3)],
			"owner/repo#1@a:src/empty.ts:RIGHT:1": [],
		}
		expect([...diffThreadCounts("owner/repo#1@a", threads)]).toEqual([
			["src/one.ts", 2],
			["src/two.ts", 1],
		])
		expect(diffThreadCounts(null, threads).size).toBe(0)
	})

	test("the badge is empty with no threads", () => {
		expect(diffCommentBadge(0)).toBe("")
		expect(diffCommentBadge(3)).toBe("◆3")
	})
})
