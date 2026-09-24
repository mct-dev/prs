import { describe, expect, test } from "bun:test"
import { filterPullRequests, makeFilterContext, unknownFilterLookups } from "../src/filter/evaluate.js"
import { assignSections, sectionLookup, sectionMembershipByUrl, type SectionGrouping } from "../src/sections/merge.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

const now = new Date("2026-03-10T00:00:00Z")
const pr = (number: number, overrides: Parameters<typeof makePullRequest>[0] = {}) =>
	makePullRequest({ number, detailLoaded: true, updatedAt: new Date(Date.UTC(2026, 2, number)), ...overrides })
const section = (id: string): SectionGrouping => ({ id, where: null, sort: "-updated", exclusive: true })

// needs-me: 1 (pass, review), 2 (pass, approved), 3 (fail, review). mine: 4 (pass, review).
const one = pr(1, { checkStatus: "passing", reviewStatus: "review" })
const two = pr(2, { checkStatus: "passing", reviewStatus: "approved" })
const three = pr(3, { checkStatus: "failing", reviewStatus: "review" })
const four = pr(4, { checkStatus: "passing", reviewStatus: "review" })
const all = [one, two, three, four]
const states = [
	{ id: "needs-me", status: "ready" as const, urls: [one.url, two.url, three.url] },
	{ id: "mine", status: "ready" as const, urls: [four.url] },
]
const groups = assignSections(
	states.map((state) => section(state.id)),
	new Map(states.map((state) => [state.id, state.urls])),
	new Map(all.map((item) => [item.url, item])),
	makeFilterContext({ now }),
)
const context = makeFilterContext({ now, lookups: { ...unknownFilterLookups, section: sectionLookup(states, sectionMembershipByUrl(groups)) } })
const numbers = (query: string) => filterPullRequests(all, query, context).map((item) => item.number)

describe("section: filter", () => {
	test("keeps only the section's PRs", () => {
		expect(numbers("section:needs-me").sort()).toEqual([1, 2, 3])
		expect(numbers("section:mine")).toEqual([4])
		expect(numbers("-section:needs-me")).toEqual([4])
	})

	test("ci:pass -review:approved inside Needs my review", () => {
		// Within the section's own rows (what the sections view filters).
		const needsMe = groups.find((group) => group.id === "needs-me")!.pullRequests
		expect(filterPullRequests(needsMe, "ci:pass -review:approved", context).map((item) => item.number)).toEqual([1])
		// From anywhere, with section: narrowing to the same rows.
		expect(numbers("section:needs-me ci:pass -review:approved")).toEqual([1])
	})

	test("is unknown (never hides) before sections load or for an unknown id", () => {
		const notLoaded = makeFilterContext({ now, lookups: { ...unknownFilterLookups, section: sectionLookup([], null) } })
		expect(filterPullRequests(all, "section:needs-me", notLoaded)).toHaveLength(4)
		expect(numbers("section:nope")).toHaveLength(4)
	})

	test("a loading section does not hide PRs that are not assigned yet", () => {
		const loading = [{ id: "team", status: "loading" as const }]
		const lookup = sectionLookup(loading, new Map())
		expect(lookup(one, "team")).toBe("unknown")
	})
})
