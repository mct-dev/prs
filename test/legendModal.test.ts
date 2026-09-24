import { describe, expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// `?` opens the icon legend over the list; esc, `?` and q close it.
const probe = `
	import { act, createElement } from "react"
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("./src/App.tsx")
	const setup = await createTestRenderer({ width: 100, height: 32 })
	const root = createRoot(setup.renderer)
	const step = async (count) => {
		for (let index = 0; index < count; index++) {
			await act(async () => {
				await setup.renderOnce()
				await new Promise((resolve) => setTimeout(resolve, 5))
			})
		}
	}
	const frame = () => setup.captureCharFrame()
	const press = async (fn) => {
		act(fn)
		await step(6)
	}
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	await step(60)
	const out = {}
	out.list = frame()
	await press(() => setup.mockInput.pressKey("?"))
	out.open = frame()
	await press(() => setup.mockInput.pressKey("j"))
	out.afterJ = frame()
	await press(() => setup.mockInput.pressEscape())
	out.closedByEsc = frame()
	await press(() => setup.mockInput.pressKey("?"))
	await press(() => setup.mockInput.pressKey("?"))
	out.closedByQuestion = frame()
	await press(() => setup.mockInput.pressKey("?"))
	await press(() => setup.mockInput.pressKey("q"))
	out.closedByQ = frame()
	console.log(JSON.stringify(out))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
`

describe("legend modal", () => {
	test("? toggles the icon legend; esc and q close it", async () => {
		const stdout = await runIsolatedProbe(probe, {
			GHUI_MOCK_PR_COUNT: "40",
			GHUI_MOCK_FIXTURE_PATH: "/nonexistent/prs-test/fixture.json",
			GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
			GHUI_CONFIG_DIR: "/nonexistent/prs-test/config",
			PRS_DEFAULT_VIEW: undefined,
			PRS_SECTIONS_PATH: "/nonexistent/prs-test/sections.yaml",
		})
		const out = JSON.parse(stdout.split("\n").at(-1)!)
		if (process.env.PRINT_FRAMES) console.log(out.open)

		expect(out.list).toContain("? legend")
		expect(out.list).not.toContain("Legend")

		for (const text of ["Legend", "Review", "Checks", "Brief", "changes requested", "auto-merge on", "still loading", "low / med / high risk", "brief is stale"]) {
			expect(out.open).toContain(text)
		}
		// List keys don't leak through while the legend is up.
		expect(out.afterJ).toContain("Legend")

		expect(out.closedByEsc).not.toContain("low / med / high risk")
		expect(out.closedByQuestion).not.toContain("low / med / high risk")
		expect(out.closedByQ).not.toContain("low / med / high risk")
		expect(out.closedByQ).toContain("? legend")
	}, 30000)
})
