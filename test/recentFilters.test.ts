import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { maxRecentFilters, parseRecentFilters, pushRecentFilter, readRecentFilters, writeRecentFilters } from "../src/filter/recent.js"
import { filterPullRequests, makeFilterContext, unknownFilterLookups } from "../src/filter/evaluate.js"
import { riskUnknownNote, usesRiskFilter } from "../src/filter/suggest.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

describe("recent filters", () => {
	test("newest first, deduped, blanks ignored, capped", () => {
		expect(pushRecentFilter(["ci:fail", "author:@me"], "author:@me")).toEqual(["author:@me", "ci:fail"])
		expect(pushRecentFilter(["ci:fail"], "   ")).toEqual(["ci:fail"])
		const same = ["ci:fail", "author:@me"]
		expect(pushRecentFilter(same, " ci:fail ")).toBe(same)
		const many = Array.from({ length: 12 }, (_, index) => `q${index}`).reduce<readonly string[]>((list, query) => pushRecentFilter(list, query), [])
		expect(many.length).toBe(maxRecentFilters)
		expect(many[0]).toBe("q11")
	})

	test("broken or odd files read as empty", () => {
		expect(parseRecentFilters("not json")).toEqual([])
		expect(parseRecentFilters('{"a":1}')).toEqual([])
		expect(parseRecentFilters('["ci:pass", 3, ""]')).toEqual(["ci:pass"])
		expect(readRecentFilters("/nonexistent/prs-test/recent-filters.json")).toEqual([])
	})

	test("round-trips through a file", () => {
		const path = join(mkdtempSync(join(tmpdir(), "prs-recent-")), "nested", "recent-filters.json")
		writeRecentFilters(["risk:high brief:done"], path)
		expect(readRecentFilters(path)).toEqual(["risk:high brief:done"])
	})
})

describe("unknown risk", () => {
	test("never hides a PR; brief:done narrows to reviewed ones", () => {
		const reviewed = makePullRequest({ number: 1 })
		const unreviewed = makePullRequest({ number: 2, url: "https://github.com/my-org/api/pull/2" })
		const context = makeFilterContext({
			lookups: {
				...unknownFilterLookups,
				risk: (pullRequest) => (pullRequest.number === 1 ? "high" : "unknown"),
				brief: (pullRequest) => (pullRequest.number === 1 ? "done" : "none"),
			},
		})
		expect(filterPullRequests([reviewed, unreviewed], "risk:high", context).map((pullRequest) => pullRequest.number)).toEqual([1, 2])
		expect(filterPullRequests([reviewed, unreviewed], "risk:high brief:done", context).map((pullRequest) => pullRequest.number)).toEqual([1])
	})

	test("note text and detection", () => {
		expect(usesRiskFilter("ci:pass -risk:low")).toBe(true)
		expect(usesRiskFilter("brisk")).toBe(false)
		expect(riskUnknownNote(1)).toBe("1 PR has no brief (shown as unknown)")
		expect(riskUnknownNote(12)).toBe("12 PRs have no brief (shown as unknown)")
	})
})
