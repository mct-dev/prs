import { describe, expect, test } from "bun:test"
import { defaultReviewConfig, parseReviewConfig, resolvePreset } from "../src/review/config.ts"

describe("parseReviewConfig", () => {
	test("defaults when missing", () => {
		const config = parseReviewConfig(undefined)
		expect(config.defaultPreset).toBe("claude")
		expect(config.concurrency).toBe(2)
		expect(config.timeoutMs).toBe(20 * 60_000)
		expect(config.presets.claude).toEqual(defaultReviewConfig.presets.claude!)
		expect(config.presets.codex?.agent).toBe("codex")
	})

	test("merges user presets over defaults", () => {
		const config = parseReviewConfig({
			default: "deep",
			concurrency: 3.7,
			timeoutMinutes: 5,
			presets: {
				claude: { model: "opus", maxBudgetUsd: 1 },
				deep: { agent: "claude", skill: "my-plugin:review", extraPrompt: "Focus on security." },
				broken: { agent: "other" },
			},
		})
		expect(config.defaultPreset).toBe("deep")
		expect(config.concurrency).toBe(3)
		expect(config.timeoutMs).toBe(5 * 60_000)
		expect(config.presets.claude).toMatchObject({ skill: "review", model: "opus", maxBudgetUsd: 1 })
		expect(config.presets.deep).toMatchObject({ agent: "claude", skill: "my-plugin:review", extraPrompt: "Focus on security.", maxBudgetUsd: null })
		expect(config.presets.broken).toBeUndefined()
	})

	test("explicit null clears a default", () => {
		expect(parseReviewConfig({ presets: { claude: { skill: null } } }).presets.claude?.skill).toBeNull()
	})

	test("unknown default falls back and env binary override applies to all presets", () => {
		const config = parseReviewConfig({ default: "missing" }, "/tmp/fake-agent")
		expect(config.defaultPreset).toBe("claude")
		expect(Object.values(config.presets).every((preset) => preset.command === "/tmp/fake-agent")).toBe(true)
	})

	test("resolvePreset", () => {
		const config = parseReviewConfig(undefined)
		expect(resolvePreset(config)?.id).toBe("claude")
		expect(resolvePreset(config, "codex")?.id).toBe("codex")
		expect(resolvePreset(config, "nope")).toBeNull()
	})
})
