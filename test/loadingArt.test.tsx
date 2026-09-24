import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"
import { ART_MAX_HEIGHT, ART_MAX_WIDTH, ART_MIN_HEIGHT, ART_MIN_WIDTH, artFrameText, artSizeFor, LOADING_ART_VARIANTS, renderArtFrame } from "../src/ui/loadingArt.ts"
import { type ArtTimer, LoadingArt } from "../src/ui/LoadingLogo.tsx"

const isArtChar = (char: string) => char === " " || (char.charCodeAt(0) > 0x2800 && char.charCodeAt(0) <= 0x28ff)

describe("renderArtFrame", () => {
	for (const variant of LOADING_ART_VARIANTS) {
		test(`${variant} is deterministic for a seed and frame`, () => {
			const input = { variant, width: 28, height: 6, frame: 42, seed: 3 }
			expect(renderArtFrame(input)).toEqual(renderArtFrame(input))
			expect(artFrameText(renderArtFrame(input))).not.toEqual(artFrameText(renderArtFrame({ ...input, frame: 60 })))
		})

		test(`${variant} fills exactly the requested box with braille dots only`, () => {
			for (const [width, height] of [
				[18, 3],
				[28, 6],
				[40, 8],
			] as const) {
				const frame = renderArtFrame({ variant, width, height, frame: 24 })
				expect(frame).toHaveLength(height)
				for (const row of frame) {
					expect(row).toHaveLength(width)
					for (const cell of row) expect(isArtChar(cell.char)).toBe(true)
				}
				expect(frame.flat().some((cell) => cell.char !== " ")).toBe(true)
			}
		})
	}

	test("returns nothing for an empty box", () => {
		expect(renderArtFrame({ variant: "contours", width: 0, height: 4, frame: 0 })).toEqual([])
	})
})

describe("artSizeFor", () => {
	test("stays inside the art bounds and the pane", () => {
		for (let width = 20; width <= 240; width += 7) {
			for (let height = 5; height <= 80; height += 5) {
				const size = artSizeFor(width, height)
				expect(size).not.toBeNull()
				expect(size!.width).toBeGreaterThanOrEqual(ART_MIN_WIDTH)
				expect(size!.width).toBeLessThanOrEqual(Math.min(ART_MAX_WIDTH, width))
				expect(size!.height).toBeGreaterThanOrEqual(ART_MIN_HEIGHT)
				expect(size!.height).toBeLessThanOrEqual(Math.min(ART_MAX_HEIGHT, height - 2))
			}
		}
	})

	test("gives up on panes too small for art", () => {
		expect(artSizeFor(19, 40)).toBeNull()
		expect(artSizeFor(120, 4)).toBeNull()
	})
})

describe("LoadingArt", () => {
	let createTestRenderer: typeof import("@opentui/core/testing").createTestRenderer
	let createRoot: typeof import("@opentui/react").createRoot

	beforeAll(async () => {
		// @ts-expect-error -- React's act environment flag is intentionally global.
		globalThis.IS_REACT_ACT_ENVIRONMENT = true
		;({ createTestRenderer } = await import("@opentui/core/testing"))
		;({ createRoot } = await import("@opentui/react"))
	})

	const fakeTimer = () => {
		const calls = { set: [] as number[], cleared: [] as unknown[] }
		let nextHandle = 1
		const timer: ArtTimer = {
			setInterval: (_callback, ms) => {
				calls.set.push(ms)
				return nextHandle++
			},
			clearInterval: (handle) => calls.cleared.push(handle),
		}
		return { timer, calls }
	}

	const mount = async (props: { animated: boolean; timer: ArtTimer }) => {
		const setup = await createTestRenderer({ width: 30, height: 8 })
		const root = createRoot(setup.renderer)
		act(() => {
			root.render(<LoadingArt width={28} height={6} baseColor="#555555" accentColor="#88aaff" variant="contours" seed={7} {...props} />)
		})
		await act(async () => {
			await setup.renderOnce()
		})
		return { ...setup, root }
	}

	test("animated art runs its own timer and clears it on unmount", async () => {
		const { timer, calls } = fakeTimer()
		const setup = await mount({ animated: true, timer })
		expect(calls.set).toHaveLength(1)
		expect(calls.set[0]).toBeGreaterThanOrEqual(1000 / 15)
		expect(calls.set[0]).toBeLessThanOrEqual(1000 / 10)
		act(() => setup.root.unmount())
		setup.renderer.destroy()
		expect(calls.cleared).toEqual([1])
	})

	test("static art draws the still frame and sets no timer", async () => {
		const { timer, calls } = fakeTimer()
		const setup = await mount({ animated: false, timer })
		const screen = setup.captureCharFrame()
		const expected = artFrameText(renderArtFrame({ variant: "contours", width: 28, height: 6, frame: 24, seed: 7 }))
		for (const line of expected.filter((row) => row.length > 0)) expect(screen).toContain(line)
		act(() => setup.root.unmount())
		setup.renderer.destroy()
		expect(calls.set).toEqual([])
		expect(calls.cleared).toEqual([])
	})
})
