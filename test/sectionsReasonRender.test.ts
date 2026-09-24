import { describe, expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// Renders the real App in mock mode and reads the section reasons: the
// active section's header carries its summary, the selected row its per-PR reason.
const probe = `
	import { act, createElement } from "react"
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("./src/App.tsx")
	const setup = await createTestRenderer({ width: 140, height: 40 })
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
		act(() => setup.mockInput.pressKey(key, options))
		await step(8)
		return setup.captureCharFrame()
	}
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	await step(60)
	const frames = { initial: setup.captureCharFrame() }
	await press("]")
	frames.team = await press("]")
	frames.bottom = await press("G", { shift: true })
	frames.bottomAfterJ = await press("j")
	console.log(JSON.stringify(frames))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
`

describe("section reasons", () => {
	test("the active section header and selected row explain why PRs are listed", async () => {
		const stdout = await runIsolatedProbe(probe, {
			GHUI_MOCK_PR_COUNT: "40",
			GHUI_MOCK_FIXTURE_PATH: "/nonexistent/prs-test/fixture.json",
			GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
			GHUI_CONFIG_DIR: "/nonexistent/prs-test/config",
			PRS_DEFAULT_VIEW: undefined,
			PRS_SECTIONS_PATH: "/nonexistent/prs-test/sections.yaml",
		})
		const frames = JSON.parse(stdout.split("\n").at(-1)!) as Record<string, string>
		if (process.env.PRINT_FRAMES) for (const [name, frame] of Object.entries(frames)) console.log(`--- ${name}\n${frame}`)

		expect(frames.initial).toContain("Needs my review")
		expect(frames.initial).toContain("· review requested from you · not me · ready")
		// Only the active section carries its reason.
		expect(frames.initial).not.toContain("authors in mock-org/mock-team")

		// The default {my_teams} is the smallest mock team (6 people).
		expect(frames.team).toContain("· authors in mock-org/mock-team (6 people) · not me")
		expect(frames.team).toMatch(/· in mock-org\/mock-team \(6 people\) · not me/)
		expect(frames.bottomAfterJ).toBe(frames.bottom)
	})
})
