import { describe, expect, test } from "bun:test"
import { makeFilterContext } from "../src/filter/evaluate.js"
import { parseWhereExpression } from "../src/filter/parse.js"
import { assignSections, mergeQueryResults, sortSectionPullRequests, type SectionGrouping } from "../src/sections/merge.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

const context = makeFilterContext({ now: new Date("2026-03-10T00:00:00Z"), viewer: "alice" })
const pr = (number: number, overrides: Parameters<typeof makePullRequest>[0] = {}) => makePullRequest({ number, updatedAt: new Date(Date.UTC(2026, 2, number)), ...overrides })
const byUrl = (...items: ReturnType<typeof pr>[]) => new Map(items.map((item) => [item.url, item]))
const section = (id: string, overrides: Partial<SectionGrouping> = {}): SectionGrouping => ({ id, where: null, sort: "-updated", exclusive: true, ...overrides })

describe("mergeQueryResults", () => {
	test("dedupes by url, sorts newest first, trims to limit", () => {
		const merged = mergeQueryResults(
			[
				[pr(1), pr(3)],
				[pr(3), pr(2), pr(4)],
			],
			3,
		)
		expect(merged.map((item) => item.number)).toEqual([4, 3, 2])
	})
})

describe("assignSections", () => {
	const one = pr(1)
	const two = pr(2)
	const three = pr(3)
	const all = byUrl(one, two, three)

	test("first match wins across exclusive sections", () => {
		const groups = assignSections(
			[section("a"), section("b")],
			new Map([
				["a", [one.url, two.url]],
				["b", [two.url, three.url]],
			]),
			all,
			context,
		)
		expect(groups.map((group) => [group.id, group.pullRequests.map((item) => item.number)])).toEqual([
			["a", [2, 1]],
			["b", [3]],
		])
	})

	test("exclusive: false shows claimed PRs and claims nothing", () => {
		const groups = assignSections(
			[section("a"), section("shared", { exclusive: false }), section("c")],
			new Map([
				["a", [one.url]],
				["shared", [one.url, two.url]],
				["c", [two.url, three.url]],
			]),
			all,
			context,
		)
		expect(groups.map((group) => group.pullRequests.map((item) => item.number))).toEqual([[1], [2, 1], [3, 2]])
	})

	test("where hides only definite false and does not claim hidden PRs", () => {
		const reviewedOld = pr(1, { viewerLatestReviewOid: "old", headRefOid: "new" })
		const reviewedCurrent = pr(2, { viewerLatestReviewOid: "same", headRefOid: "same" })
		const unknown = pr(3)
		const groups = assignSections(
			[section("rereview", { where: parseWhereExpression("me.reviewed and not me.reviewed_since_push") }), section("rest")],
			new Map([
				["rereview", [reviewedOld.url, reviewedCurrent.url, unknown.url]],
				["rest", [reviewedCurrent.url]],
			]),
			byUrl(reviewedOld, reviewedCurrent, unknown),
			context,
		)
		expect(groups.map((group) => group.pullRequests.map((item) => item.number))).toEqual([[3, 1], [2]])
	})

	test("skips urls that are no longer displayed", () => {
		const groups = assignSections([section("a")], new Map([["a", [one.url, "https://github.com/my-org/web/pull/99"]]]), all, context)
		expect(groups[0]!.pullRequests).toEqual([one])
	})
})

describe("sortSectionPullRequests", () => {
	test("sorts ascending, descending, and puts unknown values last", () => {
		const small = pr(1, { detailLoaded: true, additions: 5, createdAt: new Date("2026-03-01T00:00:00Z") })
		const big = pr(2, { detailLoaded: true, additions: 500, createdAt: new Date("2026-02-01T00:00:00Z") })
		const unknown = pr(3, { createdAt: new Date("2026-03-05T00:00:00Z") })
		const items = [small, big, unknown]
		expect(sortSectionPullRequests(items, "updated", context).map((item) => item.number)).toEqual([1, 2, 3])
		expect(sortSectionPullRequests(items, "-updated", context).map((item) => item.number)).toEqual([3, 2, 1])
		expect(sortSectionPullRequests(items, "size", context).map((item) => item.number)).toEqual([1, 2, 3])
		expect(sortSectionPullRequests(items, "-size", context).map((item) => item.number)).toEqual([2, 1, 3])
		expect(sortSectionPullRequests(items, "-age", context).map((item) => item.number)).toEqual([2, 1, 3])
		expect(sortSectionPullRequests(items, "-risk", context).map((item) => item.number)).toEqual([3, 2, 1])
	})
})
