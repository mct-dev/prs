import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { decodeRiskBrief, parseRiskBriefJson, riskBriefJsonSchema } from "../src/review/briefSchema.ts"

const goodBrief = {
	risk: "medium",
	summary: "Adds a retry around the fetch loop.",
	before_after: null,
	focus_areas: [{ file: "src/fetch.ts", lines: "10-42", why: "New retry loop could spin forever.", severity: "high" }],
	safe_to_skip: [{ path: "test/**", why: "Snapshot updates only." }],
	questions: ["Is three retries enough?"],
	tests: "Unit tests cover the happy path only.",
	confidence: "high",
}

const decodes = (value: unknown) => Exit.isSuccess(Effect.runSyncExit(decodeRiskBrief(value)))

describe("RiskBrief schema", () => {
	test("accepts a strict-mode brief with nulls", () => {
		expect(decodes(goodBrief)).toBe(true)
	})

	test("accepts missing optional keys", () => {
		const { before_after: _before, tests: _tests, ...rest } = goodBrief
		expect(decodes({ ...rest, focus_areas: [{ file: "a.ts", why: "x", severity: "low" }] })).toBe(true)
	})

	test("rejects bad risk levels and missing required fields", () => {
		expect(decodes({ ...goodBrief, risk: "critical" })).toBe(false)
		expect(decodes({ ...goodBrief, summary: undefined })).toBe(false)
		expect(decodes({ ...goodBrief, focus_areas: [{ file: "a.ts", why: "x" }] })).toBe(false)
		expect(decodes({ ...goodBrief, questions: "nope" })).toBe(false)
		expect(decodes(null)).toBe(false)
	})

	test("parses brief JSON text", () => {
		expect(Exit.isSuccess(Effect.runSyncExit(parseRiskBriefJson(JSON.stringify(goodBrief))))).toBe(true)
		expect(Exit.isSuccess(Effect.runSyncExit(parseRiskBriefJson("{not json")))).toBe(false)
	})
})

describe("riskBriefJsonSchema", () => {
	// OpenAI strict structured outputs: every object closes additionalProperties and requires every key.
	const walk = (node: unknown, path: string, visit: (node: Record<string, unknown>, path: string) => void) => {
		if (!node || typeof node !== "object") return
		const record = node as Record<string, unknown>
		visit(record, path)
		if (record.properties && typeof record.properties === "object") {
			for (const [key, child] of Object.entries(record.properties)) walk(child, `${path}.${key}`, visit)
		}
		if (record.items) walk(record.items, `${path}[]`, visit)
	}

	test("is strict-mode compatible", () => {
		const objects: string[] = []
		walk(riskBriefJsonSchema, "$", (node, path) => {
			if (node.type !== "object") return
			objects.push(path)
			expect(node.additionalProperties).toBe(false)
			expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort())
		})
		expect(objects).toEqual(["$", "$.focus_areas[]", "$.safe_to_skip[]"])
	})

	test("matches the Effect schema's fields", () => {
		expect(Object.keys(riskBriefJsonSchema.properties).sort()).toEqual(Object.keys(goodBrief).sort())
	})
})
