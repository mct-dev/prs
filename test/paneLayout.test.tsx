import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import { SplitPane, normalizeJunctionRows, paneContentWidth } from "../src/ui/paneLayout.tsx"
import { PlainLine } from "../src/ui/primitives.tsx"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe("normalizeJunctionRows", () => {
	test("deduplicates, sorts, and drops rows outside the pane height", () => {
		expect(normalizeJunctionRows(4, [3, 1, 1, -1, 4, 2.5, 0])).toEqual([0, 1, 3])
	})
})

describe("paneContentWidth", () => {
	test("accounts for symmetric inset while preserving a drawable column", () => {
		expect(paneContentWidth(20)).toBe(18)
		expect(paneContentWidth(20, 2)).toBe(16)
		expect(paneContentWidth(1)).toBe(1)
	})
})

describe("SplitPane", () => {
	test("normalizes junction rows before rendering the separator column", async () => {
		const setup = await createTestRenderer({ width: 12, height: 4 })
		const root = createRoot(setup.renderer)

		act(() => {
			root.render(
				<SplitPane
					height={4}
					leftWidth={3}
					rightWidth={4}
					junctionRows={[2, 1, 2, -1, 99]}
					left={
						<>
							<PlainLine text="L0" />
							<PlainLine text="L1" />
							<PlainLine text="L2" />
							<PlainLine text="L3" />
						</>
					}
					right={
						<>
							<PlainLine text="R0" />
							<PlainLine text="R1" />
							<PlainLine text="R2" />
							<PlainLine text="R3" />
						</>
					}
				/>,
			)
		})

		await act(async () => {
			await setup.renderOnce()
		})

		const separatorColumn = setup
			.captureCharFrame()
			.split("\n")
			.slice(0, 4)
			.map((line) => line[3])

		expect(separatorColumn).toEqual(["│", "├", "├", "│"])

		act(() => {
			root.unmount()
		})
		setup.renderer.destroy()
	})
})
