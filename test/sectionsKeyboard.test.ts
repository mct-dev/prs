import { describe, expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// Renders the real App in a child process (the runtime is chosen at module
// load) and drives the section keys, reading collapsed state from the headers
// and the selected PR from the detail pane.
const probe = `
	import { act, createElement } from "react"
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("./src/App.tsx")
	const setup = await createTestRenderer({ width: 120, height: 40 })
	const root = createRoot(setup.renderer)
	const step = async (count) => {
		for (let index = 0; index < count; index++) {
			await act(async () => {
				await setup.renderOnce()
				await new Promise((resolve) => setTimeout(resolve, 5))
			})
		}
	}
	const snapshot = () => {
		const frame = setup.captureCharFrame()
		const headers = [...frame.matchAll(/^ ([▾▸]) (Needs my review|New commits since my review|My team's work)/gm)].map((match) => (match[1] === "▸" ? "-" : "+") + match[2])
		const selected = frame.match(/│ #(\\d+) by /)?.[1] ?? null
		return { headers, selected }
	}
	const press = async (key, options) => {
		act(() => setup.mockInput.pressKey(key, options))
		await step(8)
		return snapshot()
	}
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	await step(60)
	const frames = { initial: snapshot() }
	frames.collapse = await press("z")
	frames.expand = await press("z")
	frames.collapseAll = await press("Z", { shift: true })
	frames.expandAll = await press("Z", { shift: true })
	frames.collapseAgain = await press("z")
	frames.next = await press("]")
	frames.previous = await press("[")
	frames.expandFromCursor = await press("z")
	frames.bottom = await press("G", { shift: true })
	await press("j")
	await press("j")
	frames.bottomAfterJ = await press("j")
	frames.bottomAfterK = await press("k")
	console.log(JSON.stringify(frames))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
`

describe("sections keyboard", () => {
	test("z, Z, [ and ] collapse and re-expand the section under the cursor", async () => {
		const stdout = await runIsolatedProbe(probe, {
			GHUI_MOCK_PR_COUNT: "40",
			GHUI_MOCK_FIXTURE_PATH: "/nonexistent/prs-test/fixture.json",
			GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
			GHUI_CONFIG_DIR: "/nonexistent/prs-test/config",
			// No PRS_DEFAULT_VIEW: sections is the home view in mock mode too.
			PRS_DEFAULT_VIEW: undefined,
			PRS_SECTIONS_PATH: "/nonexistent/prs-test/sections.yaml",
		})
		const frames = JSON.parse(stdout.split("\n").at(-1)!)
		const needs = "Needs my review"
		expect(frames.initial.headers[0]).toBe(`+${needs}`)
		const firstSelected = frames.initial.selected
		expect(firstSelected).not.toBeNull()

		// z collapses the first section and moves the selection into the next one.
		expect(frames.collapse.headers[0]).toBe(`-${needs}`)
		expect(frames.collapse.selected).not.toBe(firstSelected)
		// A second z re-expands the same section rather than collapsing the next.
		expect(frames.expand.headers.every((header: string) => header.startsWith("+"))).toBe(true)
		expect(frames.expand.selected).toBe(firstSelected)

		// Z collapses everything, Z again expands everything.
		expect(frames.collapseAll.headers.every((header: string) => header.startsWith("-"))).toBe(true)
		expect(frames.expandAll.headers.every((header: string) => header.startsWith("+"))).toBe(true)
		expect(frames.expandAll.selected).toBe(firstSelected)

		// ] then [ returns the cursor to the collapsed section, and z expands it.
		expect(frames.collapseAgain.headers[0]).toBe(`-${needs}`)
		expect(frames.previous.headers[0]).toBe(`-${needs}`)
		expect(frames.expandFromCursor.headers[0]).toBe(`+${needs}`)
		expect(frames.expandFromCursor.selected).toBe(firstSelected)

		// j at the bottom of the last section stays put (no wrap to the first section); k still moves up.
		expect(frames.bottom.selected).not.toBeNull()
		expect(frames.bottom.selected).not.toBe(firstSelected)
		expect(frames.bottomAfterJ.selected).toBe(frames.bottom.selected)
		expect(frames.bottomAfterK.selected).not.toBe(frames.bottom.selected)
	}, 30_000)
})
