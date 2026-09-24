import { describe, expect, test } from "bun:test"
import {
	IllegalQueryError,
	issueQueryToListInput,
	itemQueryCacheKey,
	pullRequestQueryToListInput,
	searchQualifier,
	type IssueQuery,
	type ItemListInput,
	type PullRequestQuery,
} from "../src/item.js"

const prInput = (overrides: Partial<ItemListInput<"pullRequest">> = {}): ItemListInput<"pullRequest"> => ({
	kind: "pullRequest",
	mode: "all",
	repository: "owner/name",
	cursor: null,
	pageSize: 50,
	...overrides,
})

const issueInput = (overrides: Partial<ItemListInput<"issue">> = {}): ItemListInput<"issue"> => ({
	kind: "issue",
	mode: "all",
	repository: "owner/name",
	cursor: null,
	pageSize: 50,
	...overrides,
})

describe("searchQualifier — pull requests", () => {
	test("all + repository → is:pr repo:… is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(prInput({ mode: "all", repository: "owner/name" }))).toBe("is:pr repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("authored without repository → is:pr author:@me is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(prInput({ mode: "authored", repository: null }))).toBe("is:pr author:@me is:open archived:false sort:updated-desc")
	})

	test("authored with repository scopes the search", () => {
		expect(searchQualifier(prInput({ mode: "authored", repository: "owner/name" }))).toBe("is:pr author:@me repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("review without repository → is:pr review-requested:@me is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(prInput({ mode: "review", repository: null }))).toBe("is:pr review-requested:@me is:open archived:false sort:updated-desc")
	})

	test("review with repository scopes the search", () => {
		expect(searchQualifier(prInput({ mode: "review", repository: "owner/name" }))).toBe("is:pr review-requested:@me repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("assigned + null → is:pr assignee:@me is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(prInput({ mode: "assigned", repository: null }))).toBe("is:pr assignee:@me is:open archived:false sort:updated-desc")
	})

	test("mentioned + null → is:pr mentions:@me is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(prInput({ mode: "mentioned", repository: null }))).toBe("is:pr mentions:@me is:open archived:false sort:updated-desc")
	})
})

describe("searchQualifier — issues", () => {
	test("all + repository → is:issue repo:… is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(issueInput({ mode: "all", repository: "owner/name" }))).toBe("is:issue repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("authored without repository → is:issue author:@me is:open archived:false sort:updated-desc", () => {
		expect(searchQualifier(issueInput({ mode: "authored", repository: null }))).toBe("is:issue author:@me is:open archived:false sort:updated-desc")
	})

	test("authored with repository scopes the issue search", () => {
		expect(searchQualifier(issueInput({ mode: "authored", repository: "owner/name" }))).toBe("is:issue author:@me repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("assigned with repository", () => {
		expect(searchQualifier(issueInput({ mode: "assigned", repository: "owner/name" }))).toBe("is:issue assignee:@me repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("mentioned without repository", () => {
		expect(searchQualifier(issueInput({ mode: "mentioned", repository: null }))).toBe("is:issue mentions:@me is:open archived:false sort:updated-desc")
	})
})

describe("searchQualifier — invariants", () => {
	test("mode all + repository null throws IllegalQueryError (would mean every PR on GitHub)", () => {
		expect(() => searchQualifier(prInput({ mode: "all", repository: null }))).toThrow(IllegalQueryError)
	})

	test("cursor and pageSize do not appear in the qualifier", () => {
		const a = searchQualifier(prInput({ mode: "authored", cursor: null, pageSize: 50 }))
		const b = searchQualifier(prInput({ mode: "authored", cursor: "abc", pageSize: 100 }))
		expect(a).toBe(b)
	})
})

describe("itemQueryCacheKey", () => {
	test("same query → same key regardless of textFilter", () => {
		const q1: PullRequestQuery = { mode: "authored", repository: "owner/name", textFilter: "" }
		const q2: PullRequestQuery = { mode: "authored", repository: "owner/name", textFilter: "feat" }
		expect(itemQueryCacheKey("pullRequest", q1)).toBe(itemQueryCacheKey("pullRequest", q2))
	})

	test("different mode → different key", () => {
		const q1: PullRequestQuery = { mode: "authored", repository: null, textFilter: "" }
		const q2: PullRequestQuery = { mode: "review", repository: null, textFilter: "" }
		expect(itemQueryCacheKey("pullRequest", q1)).not.toBe(itemQueryCacheKey("pullRequest", q2))
	})

	test("different repository → different key", () => {
		const q1: PullRequestQuery = { mode: "authored", repository: null, textFilter: "" }
		const q2: PullRequestQuery = { mode: "authored", repository: "owner/name", textFilter: "" }
		expect(itemQueryCacheKey("pullRequest", q1)).not.toBe(itemQueryCacheKey("pullRequest", q2))
	})

	test("different kind → different key for same mode/repo", () => {
		const pr: PullRequestQuery = { mode: "authored", repository: "owner/name", textFilter: "" }
		const issue: IssueQuery = { mode: "authored", repository: "owner/name", textFilter: "" }
		expect(itemQueryCacheKey("pullRequest", pr)).not.toBe(itemQueryCacheKey("issue", issue))
	})
})

describe("query → ListInput round-trip through searchQualifier", () => {
	test("PullRequestQuery feeds the expected qualifier", () => {
		const query: PullRequestQuery = { mode: "review", repository: "owner/name", textFilter: "ignore" }
		const input = pullRequestQueryToListInput(query, null, 50)
		expect(searchQualifier(input)).toBe("is:pr review-requested:@me repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("IssueQuery feeds the expected qualifier", () => {
		const query: IssueQuery = { mode: "assigned", repository: "owner/name", textFilter: "" }
		const input = issueQueryToListInput(query, null, 50)
		expect(searchQualifier(input)).toBe("is:issue assignee:@me repo:owner/name is:open archived:false sort:updated-desc")
	})

	test("cursor is passed through but does not change the qualifier", () => {
		const query: PullRequestQuery = { mode: "authored", repository: null, textFilter: "" }
		const a = pullRequestQueryToListInput(query, null, 50)
		const b = pullRequestQueryToListInput(query, "page-2-cursor", 50)
		expect(a.cursor).toBeNull()
		expect(b.cursor).toBe("page-2-cursor")
		expect(searchQualifier(a)).toBe(searchQualifier(b))
	})
})
