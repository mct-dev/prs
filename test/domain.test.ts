import { describe, expect, test } from "bun:test"
import { pullRequestQueueSearchQualifier } from "../src/domain.js"
import { viewCacheKey } from "../src/pullRequestViews.js"

describe("pullRequestQueueSearchQualifier", () => {
	test("repository mode with repository → repo: qualifier", () => {
		expect(pullRequestQueueSearchQualifier("repository", "owner/name")).toBe("repo:owner/name")
	})

	test("repository mode without repository falls back to @me and excludes archived repositories", () => {
		expect(pullRequestQueueSearchQualifier("repository", null)).toBe("author:@me archived:false")
	})

	test("authored mode → author:@me excluding archived repositories", () => {
		expect(pullRequestQueueSearchQualifier("authored", null)).toBe("author:@me archived:false")
	})

	test("review mode with repository scopes the search to that repository", () => {
		expect(pullRequestQueueSearchQualifier("review", "owner/name")).toBe("review-requested:@me repo:owner/name archived:false")
	})

	test("assigned mode → assignee:@me excluding archived repositories", () => {
		expect(pullRequestQueueSearchQualifier("assigned", null)).toBe("assignee:@me archived:false")
	})

	test("mentioned mode → mentions:@me excluding archived repositories", () => {
		expect(pullRequestQueueSearchQualifier("mentioned", null)).toBe("mentions:@me archived:false")
	})
})

describe("viewCacheKey", () => {
	test("repository view key uses the unified item-query cache key", () => {
		expect(viewCacheKey({ _tag: "Repository", repository: "owner/name" })).toBe("pullRequest:all:owner/name")
	})

	test("queue view key uses the unified item-query cache key", () => {
		expect(viewCacheKey({ _tag: "Queue", mode: "authored", repository: null })).toBe("pullRequest:authored:_")
		expect(viewCacheKey({ _tag: "Queue", mode: "review", repository: "owner/name" })).toBe("pullRequest:review:owner/name")
	})
})
