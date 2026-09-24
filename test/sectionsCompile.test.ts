import { describe, expect, test } from "bun:test"
import { AUTHOR_CHUNK_SIZE, checkSearchLimits, compileSection, compileSections, expandToken, referencedTeams, type CompileContext } from "../src/sections/compile.js"
import { defaultSectionsConfig, parseSectionsConfig, type SectionConfig } from "../src/sections/config.js"

const context: CompileContext = {
	viewer: "alice",
	vars: { bots: ["app/dependabot", "app/renovate"], my_teams: ["my-org/backend"] },
	teamMembers: new Map([["my-org/backend", ["bob", "carol"]]]),
}

const compile = (section: Partial<SectionConfig>, overrides: Partial<CompileContext> = {}) => compileSection({ id: "s", title: "S", ...section }, { ...context, ...overrides })

describe("expandToken", () => {
	test("list vars repeat the qualifier, including a leading minus", () => {
		expect(expandToken("author:{bots}", context.vars)).toEqual(["author:app/dependabot", "author:app/renovate"])
		expect(expandToken("-author:{bots}", context.vars)).toEqual(["-author:app/dependabot", "-author:app/renovate"])
		expect(expandToken("plain", context.vars)).toEqual(["plain"])
	})

	test("unknown and empty vars", () => {
		expect(() => expandToken("author:{nope}", context.vars)).toThrow("unknown variable {nope}")
		expect(() => expandToken("author:{empty}", { empty: [] })).toThrow("variable {empty} is empty")
		expect(expandToken("-author:{empty}", { empty: [] })).toEqual([])
	})
})

describe("compileSection", () => {
	test("adds base qualifiers and substitutes {me}", () => {
		const section = compile({ query: "review-requested:{me} -author:{me} draft:false" })
		expect(section.error).toBeNull()
		expect(section.queries).toEqual(["is:pr is:open archived:false review-requested:alice -author:alice draft:false"])
	})

	test("does not duplicate base qualifiers already in the query", () => {
		expect(compile({ query: "is:open author:{me}" }).queries).toEqual(["is:pr is:open archived:false author:alice"])
	})

	test("exclude is negated onto every any: branch", () => {
		const section = compile({ any: ["review-requested:{me}", "assignee:{me}"], exclude: "author:{bots}" })
		expect(section.queries).toEqual([
			"is:pr is:open archived:false review-requested:alice -author:app/dependabot -author:app/renovate",
			"is:pr is:open archived:false assignee:alice -author:app/dependabot -author:app/renovate",
		])
	})

	test("query with any: is shared by every branch", () => {
		expect(compile({ query: "repo:my-org/web", any: ["author:{me}", "assignee:{me}"] }).queries).toEqual([
			"is:pr is:open archived:false repo:my-org/web author:alice",
			"is:pr is:open archived:false repo:my-org/web assignee:alice",
		])
	})

	test("team-authors expands to an author list", () => {
		expect(compile({ query: "team-authors:{my_teams} -author:{me}" }).queries).toEqual(["is:pr is:open archived:false -author:alice author:bob author:carol"])
		expect(compile({ query: "-team-authors:my-org/backend" }).queries).toEqual(["is:pr is:open archived:false -author:bob -author:carol"])
	})

	test("large author lists are chunked across queries", () => {
		const members = Array.from({ length: AUTHOR_CHUNK_SIZE * 2 + 5 }, (_, index) => `user${index}`)
		const section = compile({ query: "team-authors:my-org/big draft:false" }, { teamMembers: new Map([["my-org/big", members]]) })
		expect(section.queries).toHaveLength(3)
		for (const query of section.queries) expect(query.startsWith("is:pr is:open archived:false draft:false author:")).toBe(true)
		expect(section.queries.flatMap((query) => query.match(/author:\S+/g) ?? [])).toHaveLength(members.length)
	})

	test("missing or empty teams are section errors", () => {
		expect(compile({ query: "team-authors:my-org/unknown" }).error).toBe("team my-org/unknown could not be loaded")
		expect(compile({ query: "team-authors:{my_teams}" }, { vars: { my_teams: [] } }).error).toBe("variable {my_teams} is empty")
	})

	test("search limits mark the section errored", () => {
		expect(compile({ query: "x".repeat(300) }).error).toContain("free text")
		expect(compile({ query: "a OR b OR c OR d OR e OR f OR g" }).error).toContain("AND/OR/NOT")
	})

	test("where rules parse at compile time", () => {
		expect(compile({ query: "author:{me}", where: "me.reviewed and not me.reviewed_since_push" }).where).toMatchObject({ _tag: "And" })
		expect(compile({ query: "author:{me}", where: "(me.reviewed" }).error).toContain("Missing")
	})

	test("defaults and keys", () => {
		const section = compile({ query: "author:{me}" })
		expect(section).toMatchObject({ sort: "-updated", limit: 50, collapsed: false, exclusive: true })
		expect(section.key).toBe(compile({ query: "author:{me}" }).key)
		expect(section.key).not.toBe(compile({ query: "author:{me}" }, { viewer: "bob" }).key)
		expect(compile({ query: "author:{me}", limit: 5000 }).limit).toBe(500)
	})
})

describe("checkSearchLimits", () => {
	test("qualifiers do not count toward the free-text limit", () => {
		expect(checkSearchLimits(Array.from({ length: 200 }, (_, index) => `author:user${index}`).join(" "))).toBeNull()
		expect(checkSearchLimits("a AND b OR c NOT d AND e OR f")).toBeNull()
	})
})

describe("default config", () => {
	test("compiles cleanly with teams resolved", () => {
		const sections = compileSections(defaultSectionsConfig, { ...context, vars: { ...defaultSectionsConfig.vars, my_teams: ["my-org/backend"] } })
		expect(sections.map((section) => [section.id, section.error])).toEqual([
			["needs-me", null],
			["rereview", null],
			["team", null],
			["mine", null],
			["bots", null],
		])
		expect(sections[0]!.queries[0]).toContain("-author:app/github-actions")
		expect(sections[4]!.queries).toHaveLength(1)
		expect(sections[4]!.queries[0]).toContain("author:app/dependabot author:app/renovate author:app/github-actions")
		expect(sections[4]!.collapsed).toBe(true)
	})

	test("referencedTeams finds teams after var expansion", () => {
		expect(referencedTeams(defaultSectionsConfig, { ...defaultSectionsConfig.vars, my_teams: ["my-org/a", "my-org/b"], me: "alice" })).toEqual(["my-org/a", "my-org/b"])
	})
})

describe("parseSectionsConfig", () => {
	test("parses YAML", () => {
		const parsed = parseSectionsConfig(`
vars:
  bots: ["app/dependabot"]
sections:
  - id: mine
    title: Mine
    query: "author:{me}"
    collapsed: true
    limit: 10
`)
		expect(parsed).toEqual({ config: { vars: { bots: ["app/dependabot"] }, sections: [{ id: "mine", title: "Mine", query: "author:{me}", collapsed: true, limit: 10 }] } })
	})

	test("reports YAML, schema and semantic errors", () => {
		expect(parseSectionsConfig("sections: [")).toMatchObject({ error: expect.stringContaining("sections.yaml") })
		expect(parseSectionsConfig("sections:\n  - id: 1\n    title: x\n    query: y\n")).toMatchObject({ error: expect.stringContaining("sections.yaml") })
		expect(parseSectionsConfig("sections:\n  - id: a\n    title: A\n")).toEqual({ error: 'sections.yaml: section "a" needs a query or any:' })
		expect(parseSectionsConfig("sections:\n  - {id: a, title: A, query: x}\n  - {id: a, title: B, query: y}\n")).toEqual({ error: 'sections.yaml: duplicate section id "a"' })
		expect(parseSectionsConfig("sections: []")).toEqual({ error: "sections.yaml: sections.yaml defines no sections" })
	})
})
