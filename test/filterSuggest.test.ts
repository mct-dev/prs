import { describe, expect, test } from "bun:test"
import { currentFilterToken, filterDiagnostics, suggestFilter } from "../src/filter/suggest.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

const pullRequests = [
	makePullRequest({ number: 1, author: "alice", repository: "my-org/api", labels: [{ name: "bug", color: null }] }),
	makePullRequest({ number: 2, author: "bob", repository: "my-org/api", labels: [{ name: "bug", color: null }] }),
	makePullRequest({ number: 3, author: "alice", repository: "my-org/web", labels: [{ name: "needs design", color: null }] }),
	makePullRequest({ number: 4, author: "alice", repository: "my-org/web" }),
]

const suggest = (draft: string, extra: Partial<Parameters<typeof suggestFilter>[0]> = {}) => suggestFilter({ draft, pullRequests, ...extra })
const labels = (draft: string, extra: Partial<Parameters<typeof suggestFilter>[0]> = {}) => suggest(draft, extra).items.map((item) => item.label)

describe("currentFilterToken", () => {
	test("is the text after the last space", () => {
		expect(currentFilterToken("")).toBe("")
		expect(currentFilterToken("ci:pass au")).toBe("au")
		expect(currentFilterToken("ci:pass ")).toBe("")
	})
})

describe("suggestFilter", () => {
	test("empty draft shows recents first, then fields", () => {
		const items = suggest("", { recent: ["ci:fail", "author:@me"] }).items
		expect(items.slice(0, 2).map((item) => [item.kind, item.label])).toEqual([
			["recent", "ci:fail"],
			["recent", "author:@me"],
		])
		expect(items[2]!.kind).toBe("field")
		expect(items.length).toBe(8)
	})

	test("field names by prefix, each with a description", () => {
		const items = suggest("a").items
		expect(items.map((item) => item.label)).toEqual(["author:", "age>"])
		expect(items.every((item) => item.description.length > 0)).toBe(true)
		expect(items[0]!.insert).toBe("author:")
	})

	test("field completion keeps earlier tokens and negation", () => {
		expect(suggest("ci:pass -rev").items[0]!.insert).toBe("ci:pass -review:")
		expect(suggest("me.r").items.map((item) => item.insert)).toEqual(["me.reviewed ", "me.reviewed_since_push "])
	})

	test("authors ranked by frequency with @me first", () => {
		const items = suggest("author:").items
		expect(items.map((item) => item.label)).toEqual(["@me", "alice", "bob"])
		expect(items[1]!.count).toBe(3)
		expect(items[1]!.insert).toBe("author:alice ")
	})

	test("values filter by the typed prefix", () => {
		expect(labels("author:b")).toEqual(["bob"])
		expect(labels("repo:my-org/w")).toEqual(["my-org/web"])
	})

	test("labels with spaces are quoted on insert", () => {
		const item = suggest("label:n").items[0]!
		expect(item.label).toBe("needs design")
		expect(item.insert).toBe('label:"needs design" ')
	})

	test("enum values for ci, review, risk, brief, draft", () => {
		expect(labels("ci:")).toEqual(["pass", "fail", "pending", "none"])
		expect(labels("-review:")).toEqual(["approved", "changes", "required", "none", "draft"])
		expect(labels("risk:")).toEqual(["low", "medium", "high"])
		expect(labels("brief:")).toEqual(["none", "stale", "running", "done"])
		expect(labels("draft:")).toEqual(["true", "false"])
		expect(suggest("-review:ap").items[0]!.insert).toBe("-review:approved ")
	})

	test("section ids", () => {
		expect(labels("section:", { sectionIds: ["needs-me", "mine"] })).toEqual(["needs-me", "mine"])
		expect(labels("section:m", { sectionIds: ["needs-me", "mine"] })).toEqual(["mine"])
	})

	test("numeric fields offer operator and duration examples", () => {
		expect(labels("age:")).toEqual(["age>3d", "age<1d", "age>=1w", "age<=2h"])
		expect(labels("age>")).toEqual(["age>3d", "age>=1w"])
		expect(suggest("idle<").items[0]!.insert).toBe("idle<1d ")
		expect(labels("size>")).toEqual(["size>400", "size>=1k"])
	})

	test("nothing right after a space, for free text, or unknown fields", () => {
		expect(labels("ci:pass ")).toEqual([])
		expect(labels("fixlogin")).toEqual([])
		expect(labels("foo:bar")).toEqual([])
	})

	test("a fully typed value is not offered back", () => {
		expect(labels("ci:pass")).toEqual([])
	})

	test("respects the limit", () => {
		expect(suggest("", { limit: 3 }).items.length).toBe(3)
	})
})

describe("filterDiagnostics", () => {
	test("warns about unknown fields and impossible values", () => {
		expect(filterDiagnostics("foo:bar ci:passs age>soon")).toEqual([
			'unknown field "foo" (searched as text)',
			'ci: "passs" won\'t match, try pass, fail, pending, none',
			'age: "soon" won\'t match, try 3d, 2h, 1w',
		])
	})

	test("accepts valid tokens, free text and empty values", () => {
		expect(filterDiagnostics("ci:pass -review:approved risk>=med size>1k fix: typo author:@me")).toEqual([])
	})

	test("checks section ids when known", () => {
		expect(filterDiagnostics("section:nope", { sectionIds: ["needs-me"] })).toEqual(['no section "nope" (have needs-me)'])
		expect(filterDiagnostics("section:nope")).toEqual([])
	})

	test("skipCurrent ignores the token still being typed", () => {
		expect(filterDiagnostics("ci:pa", { skipCurrent: true })).toEqual([])
		expect(filterDiagnostics("ci:pa ", { skipCurrent: true }).length).toBe(1)
	})
})

describe("suggestFilter inside quotes", () => {
	test("offers nothing while a quote is open", () => {
		expect(suggest('title:"fix au').items).toEqual([])
		expect(suggest('title:"fix" au').items.length).toBeGreaterThan(0)
	})
})
