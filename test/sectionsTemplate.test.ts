import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defaultSectionsConfig, parseSectionsConfig } from "../src/sections/config.js"
import { configuredMyTeams, ensureSectionsConfigFile, myTeamsUnchanged, SECTIONS_TEMPLATE, setMyTeamsInYaml } from "../src/sections/template.js"

const dirs: string[] = []
const tempDir = async () => {
	const dir = await mkdtemp(join(tmpdir(), "prs-sections-"))
	dirs.push(dir)
	return dir
}
afterAll(async () => {
	for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

const configOf = (text: string) => {
	const parsed = parseSectionsConfig(text)
	if (!("config" in parsed)) throw new Error(parsed.error)
	return parsed.config
}

describe("sections template", () => {
	test("parses to the built-in defaults", () => {
		expect(configOf(SECTIONS_TEMPLATE)).toEqual(defaultSectionsConfig)
	})

	test("ensureSectionsConfigFile creates missing dirs once and never overwrites", async () => {
		const path = join(await tempDir(), "nested", "prs", "sections.yaml")
		expect(await ensureSectionsConfigFile(path)).toBe(true)
		expect(await Bun.file(path).text()).toBe(SECTIONS_TEMPLATE)
		await Bun.write(path, "sections: []\n")
		expect(await ensureSectionsConfigFile(path)).toBe(false)
		expect(await Bun.file(path).text()).toBe("sections: []\n")
	})
})

describe("setMyTeamsInYaml", () => {
	test("uncomments the template's example line and keeps comments", () => {
		const result = setMyTeamsInYaml(SECTIONS_TEMPLATE, ["my-org/backend", "my-org/web"])
		if (!("text" in result)) throw new Error(result.error)
		expect(result.text).toContain('  my_teams: ["my-org/backend", "my-org/web"]\n  bots:')
		expect(result.text).toContain("# prs sections")
		expect(result.text).not.toContain("# my_teams: [my-org/backend]")
		expect(configOf(result.text)).toEqual({ ...defaultSectionsConfig, vars: { ...defaultSectionsConfig.vars, my_teams: ["my-org/backend", "my-org/web"] } })
		expect(configuredMyTeams(result.text)).toEqual(["my-org/backend", "my-org/web"])
	})

	test("replaces a live block list and keeps other vars", () => {
		const text = "vars:\n  my_teams:\n    - my-org/old\n    - my-org/older\n  bots: [app/x]\nsections:\n  - id: a\n    title: A\n    query: author:{me}\n"
		const result = setMyTeamsInYaml(text, ["my-org/new"])
		if (!("text" in result)) throw new Error(result.error)
		expect(result.text).toBe('vars:\n  my_teams: ["my-org/new"]\n  bots: [app/x]\nsections:\n  - id: a\n    title: A\n    query: author:{me}\n')
	})

	test("adds vars: above sections: when missing", () => {
		const text = "# mine\nsections:\n  - id: a\n    title: A\n    query: author:{me}\n"
		const result = setMyTeamsInYaml(text, ["my-org/web"])
		if (!("text" in result)) throw new Error(result.error)
		expect(result.text.startsWith('# mine\nvars:\n  my_teams: ["my-org/web"]\n\nsections:')).toBe(true)
		expect(configuredMyTeams(result.text)).toEqual(["my-org/web"])
	})

	test("falls back to a full rewrite for flow-style vars", () => {
		const text = "vars: { bots: [app/x] }\nsections:\n  - { id: a, title: A, query: 'author:{me}' }\n"
		const result = setMyTeamsInYaml(text, ["my-org/web"])
		if (!("text" in result)) throw new Error(result.error)
		expect(configOf(result.text)).toEqual({ vars: { bots: ["app/x"], my_teams: ["my-org/web"] }, sections: [{ id: "a", title: "A", query: "author:{me}" }] })
	})

	test("refuses to touch a broken file", () => {
		expect(setMyTeamsInYaml("sections: [", ["my-org/web"])).toHaveProperty("error")
	})

	test("configuredMyTeams reads strings, lists and unset", () => {
		expect(configuredMyTeams(SECTIONS_TEMPLATE)).toBeNull()
		expect(configuredMyTeams("vars:\n  my_teams: my-org/a\nsections:\n  - id: a\n    title: A\n    query: x\n")).toEqual(["my-org/a"])
		expect(myTeamsUnchanged(["b", "a"], ["a", "b"])).toBe(true)
		expect(myTeamsUnchanged(["a"], ["a", "b"])).toBe(false)
	})
})
