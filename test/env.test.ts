import { describe, expect, test } from "bun:test"
import { Config, ConfigProvider, Effect } from "effect"
import { envConfig, envVar } from "../src/env.js"

const readConfig = <A>(config: Config.Config<A>, env: Record<string, string>) => Effect.runSync(config.parse(ConfigProvider.fromEnv({ env })))

describe("envVar", () => {
	test("prefers the PRS_ name", () => {
		expect(envVar("MOCK_PR_COUNT", { PRS_MOCK_PR_COUNT: "3", GHUI_MOCK_PR_COUNT: "9" })).toBe("3")
	})

	test("falls back to the legacy GHUI_ name", () => {
		expect(envVar("MOCK_PR_COUNT", { GHUI_MOCK_PR_COUNT: "9" })).toBe("9")
	})

	test("is undefined when neither is set", () => {
		expect(envVar("MOCK_PR_COUNT", {})).toBeUndefined()
	})
})

describe("envConfig", () => {
	const limit = envConfig(Config.int, "PR_FETCH_LIMIT").pipe(Config.withDefault(500))

	test("prefers the PRS_ name", () => {
		expect(readConfig(limit, { PRS_PR_FETCH_LIMIT: "10", GHUI_PR_FETCH_LIMIT: "20" })).toBe(10)
	})

	test("falls back to the legacy GHUI_ name", () => {
		expect(readConfig(limit, { GHUI_PR_FETCH_LIMIT: "20" })).toBe(20)
	})

	test("uses the default when neither is set", () => {
		expect(readConfig(limit, {})).toBe(500)
	})

	test("an invalid PRS_ value fails instead of falling back", () => {
		expect(() => readConfig(limit, { PRS_PR_FETCH_LIMIT: "abc", GHUI_PR_FETCH_LIMIT: "7" })).toThrow()
		expect(() => readConfig(limit, { PRS_PR_FETCH_LIMIT: "abc" })).toThrow()
	})
})
