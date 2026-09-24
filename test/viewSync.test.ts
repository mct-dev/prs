import { describe, expect, test } from "bun:test"
import { issueViewForPullRequestView } from "../src/viewSync.ts"

describe("issueViewForPullRequestView", () => {
	test("Repository view → matching Repository issue view", () => {
		expect(issueViewForPullRequestView({ _tag: "Repository", repository: "anomalyco/opencode" })).toEqual({
			_tag: "Repository",
			repository: "anomalyco/opencode",
		})
	})

	test("Queue view with a repository → Repository issue view (same repo)", () => {
		// Regression: previously the sync skipped when view.repository ===
		// selectedRepository, leaving activeIssueView stale after
		// Repository(repo) → Queue(authored, same repo).
		expect(issueViewForPullRequestView({ _tag: "Queue", mode: "authored", repository: "anomalyco/opencode" })).toEqual({
			_tag: "Repository",
			repository: "anomalyco/opencode",
		})
	})

	test("Queue view without a repository → global authored issue queue", () => {
		expect(issueViewForPullRequestView({ _tag: "Queue", mode: "authored", repository: null })).toEqual({
			_tag: "Queue",
			mode: "authored",
			repository: null,
		})
	})

	test("Queue view with non-authored mode but no repo → global authored issue queue", () => {
		// Issue side doesn't have a "review" mode; the projection always
		// uses "authored" for global queues.
		expect(issueViewForPullRequestView({ _tag: "Queue", mode: "review", repository: null })).toEqual({
			_tag: "Queue",
			mode: "authored",
			repository: null,
		})
	})

	test("Queue view with non-authored mode AND a repo → Repository issue view (same repo)", () => {
		expect(issueViewForPullRequestView({ _tag: "Queue", mode: "review", repository: "kitlangton/ghui" })).toEqual({
			_tag: "Repository",
			repository: "kitlangton/ghui",
		})
	})
})
