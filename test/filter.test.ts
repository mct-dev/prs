import { describe, expect, test } from "bun:test"
import { evaluateExpression, evaluatePredicate, filterPullRequests, globToRegExp, makeFilterContext, parseDuration } from "../src/filter/evaluate.js"
import { describeFilterQuery, FilterParseError, parseFilterQuery, parseFilterToken, parseWhereExpression, type FilterPredicate } from "../src/filter/parse.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

const now = new Date("2026-03-10T12:00:00Z")
const context = makeFilterContext({ now, viewer: "alice" })
const predicate = (token: string) => {
	const parsed = parseFilterToken(token)
	if (!parsed) throw new Error(`not a predicate: ${token}`)
	return parsed
}
const evaluate = (token: string, overrides: Parameters<typeof makePullRequest>[0] = {}) => evaluatePredicate(makePullRequest(overrides), predicate(token), context)
const where = (expression: string, overrides: Parameters<typeof makePullRequest>[0] = {}) =>
	evaluateExpression(makePullRequest(overrides), parseWhereExpression(expression), context)

describe("parseFilterToken", () => {
	test("parses field:value, negation and comparison operators", () => {
		expect(parseFilterToken("author:alice")).toEqual({ _tag: "Predicate", field: "author", op: ":", value: "alice", negated: false })
		expect(parseFilterToken("-repo:web")).toMatchObject({ field: "repo", negated: true })
		expect(parseFilterToken("size>=400")).toMatchObject({ field: "size", op: ">=", value: "400" })
		expect(parseFilterToken("age<2d")).toMatchObject({ field: "age", op: "<", value: "2d" })
		expect(parseFilterToken('label:"needs review"')).toMatchObject({ value: "needs review" })
	})

	test("unknown fields and bare negated words stay free text", () => {
		expect(parseFilterToken("foo:bar")).toBeNull()
		expect(parseFilterToken("-word")).toBeNull()
		expect(parseFilterToken("https://example.com")).toBeNull()
		expect(parseFilterToken("author:")).toBeNull()
	})

	test("bare boolean fields become true predicates", () => {
		expect(parseFilterToken("me.reviewed")).toMatchObject({ field: "me.reviewed", value: "true", negated: false })
		expect(parseFilterToken("-me.reviewed_since_push")).toMatchObject({ field: "me.reviewed_since_push", negated: true })
	})
})

describe("parseFilterQuery", () => {
	test("splits predicates from free text", () => {
		const parsed = parseFilterQuery("author:alice fix  foo:bar repo:web -word")
		expect(parsed.predicates.map((item: FilterPredicate) => item.field)).toEqual(["author", "repo"])
		expect(parsed.text).toBe("fix foo:bar -word")
	})

	test("describes the active filter", () => {
		expect(describeFilterQuery("author:alice size>400 fix")).toBe('author:alice size>400 "fix"')
		expect(describeFilterQuery("me.reviewed")).toBe("me.reviewed")
	})
})

describe("parseWhereExpression", () => {
	test("supports and/or/not with precedence and parentheses", () => {
		expect(parseWhereExpression("me.reviewed and not me.reviewed_since_push")).toMatchObject({
			_tag: "And",
			items: [{ field: "me.reviewed" }, { _tag: "Not", item: { field: "me.reviewed_since_push" } }],
		})
		expect(parseWhereExpression("author:alice or author:bob repo:web")).toMatchObject({
			_tag: "Or",
			items: [{ field: "author" }, { _tag: "And", items: [{ field: "author" }, { field: "repo" }] }],
		})
		expect(parseWhereExpression("(author:alice or author:bob) and repo:web")).toMatchObject({
			_tag: "And",
			items: [{ _tag: "Or" }, { field: "repo" }],
		})
	})

	test("rejects malformed expressions", () => {
		expect(() => parseWhereExpression("(author:alice")).toThrow(FilterParseError)
		expect(() => parseWhereExpression("author:alice and")).toThrow(FilterParseError)
		expect(() => parseWhereExpression("or repo:web")).toThrow(FilterParseError)
		expect(() => parseWhereExpression("repo:web)")).toThrow(FilterParseError)
	})
})

describe("evaluatePredicate", () => {
	test("metadata fields", () => {
		expect(evaluate("author:alice")).toBe(true)
		expect(evaluate("author:@me")).toBe(true)
		expect(evaluate("author:ALICE")).toBe(true)
		expect(evaluate("-author:alice")).toBe(false)
		expect(evaluate("author:dependabot", { author: "dependabot" })).toBe(true)
		expect(evaluate("author:app/dependabot", { author: "dependabot" })).toBe(true)
		expect(evaluate("repo:web")).toBe(true)
		expect(evaluate("repo:my-org/web")).toBe(true)
		expect(evaluate("repo:my-org/we")).toBe(false)
		expect(evaluate("draft:true", { reviewStatus: "draft" })).toBe(true)
		expect(evaluate("draft:false", { reviewStatus: "draft" })).toBe(false)
		expect(evaluate("review:approved", { reviewStatus: "approved" })).toBe(true)
		expect(evaluate("review:changes", { reviewStatus: "approved" })).toBe(false)
	})

	test("detail-only fields are unknown until details load", () => {
		expect(evaluate("size>400")).toBe("unknown")
		expect(evaluate("-size>400")).toBe("unknown")
		expect(evaluate("files>3")).toBe("unknown")
		expect(evaluate("label:bug")).toBe("unknown")
		expect(evaluate("ci:fail")).toBe("unknown")
		expect(evaluate("file:migrations/**")).toBe("unknown")
		const detailed = { detailLoaded: true, additions: 300, deletions: 200, changedFiles: 4, labels: [{ name: "Bug", color: null }], checkStatus: "failing" as const }
		expect(evaluate("size>400", detailed)).toBe(true)
		expect(evaluate("size<=400", detailed)).toBe(false)
		expect(evaluate("size>1k", detailed)).toBe(false)
		expect(evaluate("files:4", detailed)).toBe(true)
		expect(evaluate("label:bug", detailed)).toBe(true)
		expect(evaluate("ci:fail", detailed)).toBe(true)
		expect(evaluate("ci:pass", detailed)).toBe(false)
	})

	test("age and idle compare durations", () => {
		const createdAt = new Date("2026-03-07T12:00:00Z")
		const updatedAt = new Date("2026-03-10T09:00:00Z")
		expect(evaluate("age>2d", { createdAt, updatedAt })).toBe(true)
		expect(evaluate("age>1w", { createdAt, updatedAt })).toBe(false)
		expect(evaluate("idle<4h", { createdAt, updatedAt })).toBe(true)
		expect(evaluate("idle>2h", { createdAt, updatedAt })).toBe(true)
		expect(evaluate("age>soon", { createdAt, updatedAt })).toBe("unknown")
	})

	test("risk and brief come from injected lookups", () => {
		expect(evaluate("risk>=medium")).toBe("unknown")
		expect(evaluate("brief:done")).toBe("unknown")
		const withRisk = makeFilterContext({ now, lookups: { risk: () => "high", brief: () => "stale" } })
		expect(evaluatePredicate(makePullRequest(), predicate("risk>=medium"), withRisk)).toBe(true)
		expect(evaluatePredicate(makePullRequest(), predicate("risk:low"), withRisk)).toBe(false)
		expect(evaluatePredicate(makePullRequest(), predicate("brief:stale"), withRisk)).toBe(true)
	})

	test("me.reviewed uses the viewer's latest review commit", () => {
		expect(evaluate("me.reviewed")).toBe("unknown")
		expect(evaluate("me.reviewed", { viewerLatestReviewOid: null })).toBe(false)
		expect(evaluate("me.reviewed", { viewerLatestReviewOid: "old" })).toBe(true)
		expect(evaluate("me.reviewed_since_push", { viewerLatestReviewOid: "old", headRefOid: "new" })).toBe(false)
		expect(evaluate("me.reviewed_since_push", { viewerLatestReviewOid: "new", headRefOid: "new" })).toBe(true)
	})
})

describe("evaluateExpression", () => {
	test("three-valued logic keeps unknown PRs visible", () => {
		expect(where("me.reviewed and not me.reviewed_since_push")).toBe("unknown")
		expect(where("me.reviewed and not me.reviewed_since_push", { viewerLatestReviewOid: "old", headRefOid: "new" })).toBe(true)
		expect(where("me.reviewed and not me.reviewed_since_push", { viewerLatestReviewOid: "new", headRefOid: "new" })).toBe(false)
		expect(where("size>10 and author:bob")).toBe(false)
		expect(where("size>10 or author:alice")).toBe(true)
		expect(where("size>10 or author:bob")).toBe("unknown")
		expect(where("not size>10")).toBe("unknown")
	})

	test("free text inside where matches like the / filter", () => {
		expect(where("thing")).toBe(true)
		expect(where("nothing-here")).toBe(false)
	})
})

describe("filterPullRequests", () => {
	const alice = makePullRequest({ number: 1, author: "alice", title: "Fix login", updatedAt: new Date("2026-03-01T00:00:00Z") })
	const bob = makePullRequest({ number: 2, author: "bob", title: "Fix logout", repository: "my-org/api", updatedAt: new Date("2026-03-02T00:00:00Z") })
	const carol = makePullRequest({ number: 3, author: "carol", title: "Docs", updatedAt: new Date("2026-03-03T00:00:00Z") })
	const items = [alice, bob, carol]

	test("empty query returns items unchanged", () => {
		expect(filterPullRequests(items, "", context)).toBe(items)
	})

	test("tokens AND together and free text keeps score ranking", () => {
		expect(filterPullRequests(items, "fix", context).map((item) => item.number)).toEqual([2, 1])
		expect(filterPullRequests(items, "repo:web fix", context).map((item) => item.number)).toEqual([1])
		expect(filterPullRequests(items, "-author:bob -author:alice", context).map((item) => item.number)).toEqual([3])
	})

	test("unknown predicates never hide PRs", () => {
		expect(filterPullRequests(items, "size>400 ci:fail", context)).toHaveLength(3)
	})

	test("unknown field tokens are searched as free text", () => {
		expect(filterPullRequests(items, "foo:bar", context)).toHaveLength(0)
	})
})

describe("helpers", () => {
	test("parseDuration", () => {
		expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000)
		expect(parseDuration("3d")).toBe(3 * 24 * 60 * 60 * 1000)
		expect(parseDuration("1w")).toBe(7 * 24 * 60 * 60 * 1000)
		expect(parseDuration("2")).toBe(2 * 24 * 60 * 60 * 1000)
		expect(parseDuration("x")).toBeNull()
	})

	test("globToRegExp", () => {
		expect(globToRegExp("migrations/**").test("db/migrations/001.sql")).toBe(true)
		expect(globToRegExp("*.md").test("docs/readme.md")).toBe(true)
		expect(globToRegExp("*.md").test("src/app.ts")).toBe(false)
	})
})
