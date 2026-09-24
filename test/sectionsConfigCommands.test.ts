import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { moveTeamsSelection, teamsModalRows, toggleTeamsSelection } from "../src/ui/modals/teamsModalState.ts"
import { SECTIONS_TEMPLATE } from "../src/sections/template.ts"
import { runIsolatedProbe } from "./isolatedProbe.ts"

const dirs: string[] = []
afterAll(async () => {
	for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

describe("teams modal state", () => {
	const teams = teamsModalRows(
		[
			{ slug: "my-org/everyone", name: "Everyone", members: 300 },
			{ slug: "my-org/backend", name: "Backend", members: 12 },
			{ slug: "my-org/hidden", name: "hidden", members: null },
		],
		["my-org/backend", "old-org/gone"],
	)

	test("rows are smallest first, then unknown sizes, then configured teams you left", () => {
		expect(teams.map((team) => team.slug)).toEqual(["my-org/backend", "my-org/everyone", "my-org/hidden", "old-org/gone"])
	})

	test("toggle keeps list order; move wraps", () => {
		const state = { selectedIndex: 0, error: null, loading: false, teams, chosen: ["my-org/backend"], initial: ["my-org/backend"] }
		const moved = moveTeamsSelection(state, -1)
		expect(moved.selectedIndex).toBe(3)
		const unchecked = toggleTeamsSelection(moveTeamsSelection(moved, 1))
		expect(unchecked.chosen).toEqual([])
		const both = toggleTeamsSelection(moveTeamsSelection(toggleTeamsSelection(unchecked), 1))
		expect(both.chosen).toEqual(["my-org/backend", "my-org/everyone"])
	})
})

const probe = `
	import { act, createElement } from "react"
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("./src/App.tsx")
	const setup = await createTestRenderer({ width: 120, height: 36 })
	const root = createRoot(setup.renderer)
	const step = async (count) => {
		for (let index = 0; index < count; index++) {
			await act(async () => {
				await setup.renderOnce()
				await new Promise((resolve) => setTimeout(resolve, 5))
			})
		}
	}
	const press = async (key, options) => {
		act(() => (key === "return" ? setup.mockInput.pressEnter() : setup.mockInput.pressKey(key, options)))
		await step(6)
		return setup.captureCharFrame()
	}
	const runCommand = async (query) => {
		await press("p", { ctrl: true })
		for (const char of query) await press(char)
		return press("return")
	}
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	await step(60)
	const frames = {}
	frames.edit = await runCommand("edit sections config")
	await step(30)
	frames.afterEdit = setup.captureCharFrame()
	frames.teams = await runCommand("choose my teams")
	await step(10)
	frames.teams = setup.captureCharFrame()
	await press("j")
	frames.toggled = await press(" ")
	frames.saved = await press("return")
	await step(40)
	frames.reloaded = setup.captureCharFrame()
	console.log(JSON.stringify(frames))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
`

const env = (sectionsPath: string) => ({
	GHUI_MOCK_PR_COUNT: "40",
	GHUI_MOCK_FIXTURE_PATH: "/nonexistent/prs-test/fixture.json",
	GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
	GHUI_CONFIG_DIR: "/nonexistent/prs-test/config",
	PRS_DEFAULT_VIEW: undefined,
	PRS_SECTIONS_PATH: sectionsPath,
})

const framesOf = (stdout: string) => {
	const frames = JSON.parse(stdout.split("\n").at(-1)!) as Record<string, string>
	if (process.env.PRINT_FRAMES) for (const [name, frame] of Object.entries(frames)) console.log(`--- ${name}\n${frame}`)
	return frames
}

describe("sections config commands", () => {
	test("edit creates the template; choose my teams saves vars.my_teams and reloads", async () => {
		const dir = await mkdtemp(join(tmpdir(), "prs-sections-cmd-"))
		dirs.push(dir)
		const path = join(dir, "prs", "sections.yaml")
		const frames = framesOf(await runIsolatedProbe(probe, env(path)))

		expect(frames.afterEdit).toContain("sections reloaded")
		expect(frames.teams).toContain("My Teams")
		expect(frames.teams).toMatch(/\[x\] mock-org\/mock-team +.*6 people/)
		expect(frames.teams).toMatch(/\[ \] mock-org\/platform +.*14 people/)
		expect(frames.toggled).toMatch(/\[x\] mock-org\/platform/)
		expect(frames.reloaded).not.toContain("My Teams")
		expect(frames.reloaded).toContain("my_teams: mock-org/mock-team, mock-org/platform")

		const text = await Bun.file(path).text()
		expect(text).toBe(SECTIONS_TEMPLATE.replace("  # my_teams: [my-org/backend]", '  my_teams: ["mock-org/mock-team", "mock-org/platform"]'))
	})

	test("an unwritable path is reported, not thrown", async () => {
		const frames = framesOf(await runIsolatedProbe(probe, env("/nonexistent/prs-test/sections.yaml")))
		expect(frames.afterEdit).toContain("Can't create /nonexistent/prs-test/sections.yaml")
		expect(frames.saved).toContain("Can't write /nonexistent/prs-test/sections.yaml: EROFS")
		expect(frames.saved).toContain("My Teams")
	})
})
