import { describe, expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// The list footer advertises merge (m) and close (x) for an open PR.
const probe = `
	import { act, createElement } from "react"
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("./src/App.tsx")
	const setup = await createTestRenderer({ width: 160, height: 32 })
	const root = createRoot(setup.renderer)
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	for (let index = 0; index < 60; index++) {
		await act(async () => {
			await setup.renderOnce()
			await new Promise((resolve) => setTimeout(resolve, 5))
		})
	}
	console.log(JSON.stringify({ list: setup.captureCharFrame() }))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
`

describe("footer merge hints", () => {
	test("m merge and x close show for an open PR", async () => {
		const stdout = await runIsolatedProbe(probe, {
			GHUI_MOCK_PR_COUNT: "12",
			GHUI_MOCK_FIXTURE_PATH: "/nonexistent/prs-test/fixture.json",
			GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
			GHUI_CONFIG_DIR: "/nonexistent/prs-test/config",
			PRS_DEFAULT_VIEW: undefined,
			PRS_SECTIONS_PATH: "/nonexistent/prs-test/sections.yaml",
		})
		const out = JSON.parse(stdout.split("\n").at(-1)!)
		const footer = out.list.split("\n").find((line: string) => line.includes("ctrl-p commands")) ?? ""
		expect(footer).toContain("m merge")
		expect(footer).toContain("x close")
	}, 30000)
})
