import { describe, expect, test } from "bun:test"
import { stepWithinGroup } from "../src/workspace/headerDerivations.ts"

// Three sections of 3, 1 and 2 rows: rows 0-2, 3, 4-5.
const starts = [0, 3, 4]
const total = 6

describe("stepWithinGroup", () => {
	test("moves inside a section", () => {
		expect(stepWithinGroup(starts, total, 0, 1)).toBe(1)
		expect(stepWithinGroup(starts, total, 2, -1)).toBe(1)
	})

	test("clamps at the bottom of a section instead of crossing", () => {
		expect(stepWithinGroup(starts, total, 2, 1)).toBe(2)
		expect(stepWithinGroup(starts, total, 0, 10)).toBe(2)
	})

	test("clamps at the top of a section instead of crossing", () => {
		expect(stepWithinGroup(starts, total, 4, -1)).toBe(4)
		expect(stepWithinGroup(starts, total, 3, -1)).toBe(3)
	})

	test("never wraps from the bottom of the last section to the top", () => {
		expect(stepWithinGroup(starts, total, 5, 1)).toBe(5)
		expect(stepWithinGroup(starts, total, 5, 5)).toBe(5)
	})

	test("a single-row section stays put", () => {
		expect(stepWithinGroup(starts, total, 3, 1)).toBe(3)
		expect(stepWithinGroup(starts, total, 3, -1)).toBe(3)
	})

	test("an empty list selects row 0", () => {
		expect(stepWithinGroup([], 0, 0, 1)).toBe(0)
		expect(stepWithinGroup([], 0, 3, -1)).toBe(0)
	})

	test("no group starts means one big group", () => {
		expect(stepWithinGroup([], 4, 3, 1)).toBe(3)
		expect(stepWithinGroup([], 4, 1, 1)).toBe(2)
	})
})
