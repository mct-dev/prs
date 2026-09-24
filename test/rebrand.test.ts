import { describe, expect, test } from "bun:test"
import { getThemeDefinition, isThemeId } from "../src/ui/colors.js"

describe("rebrand", () => {
	test("the default theme shows as prs but keeps the ghui id for saved configs", () => {
		expect(isThemeId("ghui")).toBe(true)
		expect(getThemeDefinition("ghui").name).toBe("prs")
	})
})
