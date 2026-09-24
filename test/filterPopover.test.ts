import { describe, expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// Drives the `/` prompt in the real App (mock mode) and reads the popover and
// footer prompt back from the rendered frames.
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
	const prompt = () => frame().split("\\n").findLast((line) => line.trim().length > 0).trim()
	const act1 = async (fn) => {
		act(fn)
		await step(6)
	}
	const type = async (text) => {
		for (const char of text) await act1(() => setup.mockInput.pressKey(char))
	}
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	await step(60)
	const out = {}
	await type("/")
	out.empty = frame()
	await type("au")
	out.au = frame()
	await act1(() => setup.mockInput.pressTab())
	out.afterTab = { frame: frame(), prompt: prompt() }
	await act1(() => setup.mockInput.pressArrow("down"))
	out.picked = frame()
	await act1(() => setup.mockInput.pressEnter())
	out.accepted = { frame: frame(), prompt: prompt() }
	await type("ci:passs ")
	out.warning = frame()
	await type("re")
	await act1(() => setup.mockInput.pressEscape())
	out.dismissed = { frame: frame(), prompt: prompt() }
	await act1(() => setup.mockInput.pressEscape())
	out.cancelled = { frame: frame(), prompt: prompt() }
	await type("/")
	await type("-review:")
	await act1(() => setup.mockInput.pressArrow("down"))
	await act1(() => setup.mockInput.pressEnter())
	await act1(() => setup.mockInput.pressEnter())
	out.committed = { frame: frame(), prompt: prompt() }
	console.log(JSON.stringify(out))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
`

describe("filter popover", () => {
	test("suggests fields and values, accepts with tab/enter, esc closes popover then filter", async () => {
		const stdout = await runIsolatedProbe(probe, {
			GHUI_MOCK_PR_COUNT: "40",
			GHUI_MOCK_FIXTURE_PATH: "/nonexistent/prs-test/fixture.json",
			GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
			GHUI_CONFIG_DIR: "/nonexistent/prs-test/config",
			PRS_DEFAULT_VIEW: undefined,
			PRS_SECTIONS_PATH: "/nonexistent/prs-test/sections.yaml",
		})
		const out = JSON.parse(stdout.split("\n").at(-1)!)
		if (process.env.PRINT_FRAMES)
			console.log(
				Object.values(out)
					.map((value: any) => value.frame ?? value)
					.join("\n----\n"),
			)

		// Empty draft: field list with descriptions and the total.
		expect(out.empty).toContain("author:")
		expect(out.empty).toContain("PR author (@me for you)")
		expect(out.empty).toMatch(/│ \d+ PRs/)

		// Prefix narrows to author: / age>.
		expect(out.au).toContain("author:")
		expect(out.au).not.toContain("review:")

		// Tab accepts the first row; author values come next.
		expect(out.afterTab.prompt).toContain("/ author:")
		expect(out.afterTab.frame).toContain("@me")

		// ↓ highlights, Enter accepts instead of committing.
		expect(out.picked).toContain("›@me")
		expect(out.accepted.prompt).toContain("/ author:@me")
		expect(out.accepted.frame).toMatch(/matches \d+ of \d+ PRs/)

		// Soft warning for an impossible value.
		expect(out.warning).toContain(`ci: "passs" won't match`)

		// First Esc closes the popover only; the second leaves filter mode.
		expect(out.dismissed.frame).not.toMatch(/matches \d+ of/)
		expect(out.dismissed.prompt).toContain("/ author:@me ci:passs re")
		expect(out.cancelled.prompt).not.toContain("author:@me")
		expect(out.cancelled.frame).not.toMatch(/matches \d+ of/)

		// Enter without a highlight commits the draft as typed.
		expect(out.committed.frame).not.toMatch(/matches \d+ of/)
		expect(out.committed.frame).toContain("FILTER -review:approved")
	}, 30000)
})
