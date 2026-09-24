import { describe, expect, test } from "bun:test"
import { defaultMyTeams, type ViewerTeam } from "../src/sections/teams.ts"

const team = (slug: string, members: number | null): ViewerTeam => ({ slug, name: slug, members })

describe("defaultMyTeams", () => {
	test("no teams gives no teams", () => {
		expect(defaultMyTeams([])).toEqual([])
	})

	test("a single team is used whatever its size", () => {
		expect(defaultMyTeams([team("my-org/everyone", 300)])).toEqual(["my-org/everyone"])
	})

	test("with several teams, picks the smallest", () => {
		expect(defaultMyTeams([team("my-org/everyone", 300), team("my-org/backend", 12), team("my-org/platform", 20)])).toEqual(["my-org/backend"])
	})

	test("keeps every team tied for smallest", () => {
		expect(defaultMyTeams([team("my-org/backend", 12), team("my-org/everyone", 300), team("other-org/core", 12)])).toEqual(["my-org/backend", "other-org/core"])
	})

	test("falls back to every team when a count is unknown", () => {
		expect(defaultMyTeams([team("my-org/backend", 12), team("my-org/everyone", null)])).toEqual(["my-org/backend", "my-org/everyone"])
	})
})
