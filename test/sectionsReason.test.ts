import { describe, expect, test } from "bun:test"
import { defaultSectionsConfig } from "../src/sections/config.ts"
import { describeSection, sectionReasonFor } from "../src/sections/reason.ts"

const context = {
	vars: { ...defaultSectionsConfig.vars, me: "me", my_teams: ["my-org/backend"] },
	teamMembers: new Map([["my-org/backend", ["Alice", "bob", "carol"]]]),
}
const section = (id: string) => defaultSectionsConfig.sections.find((candidate) => candidate.id === id)!
const summary = (id: string) => describeSection(section(id), context).summary

describe("describeSection", () => {
	test("default sections read as plain language", () => {
		expect(summary("needs-me")).toBe("review requested from you · not me · ready · not bots")
		expect(summary("rereview")).toBe("you reviewed · not me · new commits since your review")
		expect(summary("team")).toBe("authors in my-org/backend (3 people) · not me")
		expect(summary("mine")).toBe("your PRs")
		expect(summary("bots")).toBe("review requested from you · bots")
	})

	test("unknown qualifiers and wheres are shown as written", () => {
		const reason = describeSection({ id: "x", title: "X", query: "repo:my-org/web label:urgent -author:{me}", where: "size > 500" }, context)
		expect(reason.summary).toBe("repo:my-org/web · label:urgent · not me · where size > 500")
	})

	test("a team that failed to load drops the count", () => {
		const reason = describeSection({ id: "x", title: "X", query: "team-authors:my-org/ghost" }, context)
		expect(reason.summary).toBe("authors in my-org/ghost")
	})

	test("any: branches join with or", () => {
		const reason = describeSection({ id: "x", title: "X", any: ["author:{me}", "team-authors:my-org/backend"] }, context)
		expect(reason.summary).toBe("(your PRs) or (authors in my-org/backend (3 people))")
	})
})

describe("sectionReasonFor", () => {
	test("names the team author", () => {
		expect(sectionReasonFor({ author: "alice" }, describeSection(section("team"), context))).toBe("@alice in my-org/backend (3 people) · not me")
	})

	test("falls back to the summary", () => {
		expect(sectionReasonFor({ author: "dave" }, describeSection(section("needs-me"), context))).toBe("review requested from you · not me · ready · not bots")
	})

	test("picks the only non-team any: branch for a non-member", () => {
		const reason = describeSection({ id: "x", title: "X", any: ["author:{me}", "team-authors:my-org/backend"] }, context)
		expect(sectionReasonFor({ author: "me" }, reason)).toBe("your PRs")
		expect(sectionReasonFor({ author: "bob" }, reason)).toBe("@bob in my-org/backend (3 people)")
	})
})
