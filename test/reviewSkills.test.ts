import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { discoverLocalSkills, matchSkills, parseSkillFrontmatter } from "../src/review/skills.ts"

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
	tempDirs.length = 0
})

const tempDir = async (label: string) => {
	const dir = await mkdtemp(join(tmpdir(), `prs-skills-${label}-`))
	tempDirs.push(dir)
	return dir
}

const put = async (path: string, content: string) => {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, content)
}

const skillFile = (name: string | null, description: string) => `---\n${name ? `name: ${name}\n` : ""}description: ${description}\n---\n\n# Body\n`

describe("parseSkillFrontmatter", () => {
	test("reads single-line name and description, unquoting values", () => {
		expect(parseSkillFrontmatter(`---\nname: "careful-review"\ndescription: 'Reviews a PR carefully'\nallowed-tools: Read\n---\nbody`)).toEqual({
			name: "careful-review",
			description: "Reviews a PR carefully",
		})
	})

	test("block scalars and missing frontmatter degrade to empty values", () => {
		expect(parseSkillFrontmatter("---\nname: x\ndescription: >\n  folded text\n---\n")).toEqual({ name: "x", description: "" })
		expect(parseSkillFrontmatter("# no frontmatter")).toEqual({ name: null, description: "" })
		expect(parseSkillFrontmatter("---\nname:\n---\n")).toEqual({ name: null, description: "" })
	})
})

describe("discoverLocalSkills", () => {
	test("finds user, installed-plugin, project and codex skills", async () => {
		const home = await tempDir("home")
		const project = await tempDir("project")
		const pluginInstall = join(home, ".claude", "plugins", "cache", "alice-tools", "reviewkit", "1.0.0")
		await put(join(home, ".claude", "skills", "review", "SKILL.md"), skillFile("review", "Alice's review skill"))
		await put(join(home, ".claude", "skills", "unnamed", "SKILL.md"), skillFile(null, "Named by its folder"))
		await put(join(home, ".claude", "skills", "notes.md"), "not a skill")
		await put(join(pluginInstall, "skills", "deep-review", "SKILL.md"), skillFile("deep-review", "Plugin review"))
		// A marketplace checkout that is not installed must stay out.
		await put(join(home, ".claude", "plugins", "marketplaces", "alice-tools", "other", "skills", "hidden", "SKILL.md"), skillFile("hidden", "Not installed"))
		await put(
			join(home, ".claude", "plugins", "installed_plugins.json"),
			JSON.stringify({ version: 2, plugins: { "reviewkit@alice-tools": [{ scope: "user", installPath: pluginInstall, version: "1.0.0" }] } }),
		)
		await put(join(project, ".claude", "skills", "my-org-style", "SKILL.md"), skillFile("my-org-style", "Project style guide"))
		// Same name as the user skill: de-duplicated per agent.
		await put(join(project, ".claude", "skills", "review", "SKILL.md"), skillFile("review", "Duplicate"))
		await put(join(home, ".codex", "skills", "review", "SKILL.md"), skillFile("review", "Codex review"))

		const skills = await discoverLocalSkills({ home, cwd: project })
		expect(skills.map((skill) => [skill.agent, skill.name, skill.source])).toEqual([
			["claude", "my-org-style", "project"],
			["claude", "review", "user"],
			["codex", "review", "codex"],
			["claude", "reviewkit:deep-review", "plugin"],
			["claude", "unnamed", "user"],
		])
		expect(skills.find((skill) => skill.name === "unnamed")?.description).toBe("Named by its folder")
	})

	test("an empty or missing home yields no skills", async () => {
		const home = await tempDir("empty")
		expect(await discoverLocalSkills({ home, cwd: null })).toEqual([])
		expect(await discoverLocalSkills({ home: join(home, "missing") })).toEqual([])
	})

	test("a malformed installed_plugins.json is ignored", async () => {
		const home = await tempDir("bad")
		await put(join(home, ".claude", "plugins", "installed_plugins.json"), "{not json")
		await put(join(home, ".claude", "skills", "review", "SKILL.md"), skillFile("review", "ok"))
		expect((await discoverLocalSkills({ home })).map((skill) => skill.name)).toEqual(["review"])
	})
})

describe("matchSkills", () => {
	const skills = [
		{ name: "code-review", description: "", agent: "claude", source: "user" },
		{ name: "review", description: "", agent: "claude", source: "user" },
		{ name: "reviewkit:deep-review", description: "", agent: "claude", source: "plugin" },
		{ name: "review", description: "", agent: "codex", source: "codex" },
	] as const

	test("filters by agent and ranks prefix and plugin-name matches first", () => {
		expect(matchSkills(skills, "claude", "rev").map((skill) => skill.name)).toEqual(["review", "reviewkit:deep-review", "code-review"])
		expect(matchSkills(skills, "claude", "deep").map((skill) => skill.name)).toEqual(["reviewkit:deep-review"])
		expect(matchSkills(skills, "codex", "").map((skill) => skill.name)).toEqual(["review"])
	})
})
