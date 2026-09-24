import { describe, expect, test } from "bun:test"
import type { TerminalColors } from "@opentui/core"
import { createSystemThemeReloader, hasCompletePalette, paletteSignature, type SystemThemeReloadEvent } from "../src/systemThemeReload.js"

const NULL_PALETTE: TerminalColors = {
	palette: Array.from({ length: 16 }, () => null),
	defaultForeground: null,
	defaultBackground: null,
	cursorColor: null,
	mouseForeground: null,
	mouseBackground: null,
	tekForeground: null,
	tekBackground: null,
	highlightBackground: null,
	highlightForeground: null,
}

const palettize = (seed: string, fg: string = "#cccccc", bg: string = "#111111", completeSlots: number = 16): TerminalColors => ({
	palette: Array.from({ length: 16 }, (_, i) => (i < completeSlots ? `#${seed.padStart(2, "0")}${i.toString(16).padStart(2, "0")}00` : null)),
	defaultForeground: fg,
	defaultBackground: bg,
	cursorColor: "#ffffff",
	mouseForeground: "#ffffff",
	mouseBackground: "#000000",
	tekForeground: null,
	tekBackground: null,
	highlightBackground: null,
	highlightForeground: null,
})

const A = palettize("aa")
const B = palettize("bb")
const C = palettize("cc")
const PARTIAL = palettize("aa", "#cccccc", "#111111", 8)

interface ScheduledTimer {
	readonly fireAt: number
	readonly fn: () => void
}

interface FakeClock {
	readonly setTimer: (fn: () => void, ms: number) => unknown
	readonly clearTimer: (handle: unknown) => void
	readonly delay: (ms: number) => Promise<void>
	readonly advance: (ms: number) => Promise<void>
	readonly flush: () => Promise<void>
	readonly now: () => number
}

const createFakeClock = (): FakeClock => {
	let now = 0
	let counter = 0
	const timers = new Map<number, ScheduledTimer>()

	const drainMicrotasks = async () => {
		for (let i = 0; i < 50; i++) {
			await Promise.resolve()
		}
	}

	const schedule = (fn: () => void, ms: number) => {
		const id = ++counter
		timers.set(id, { fireAt: now + ms, fn })
		return id
	}

	const cancel = (id: unknown) => {
		timers.delete(id as number)
	}

	return {
		setTimer: schedule,
		clearTimer: cancel,
		delay: (ms) => new Promise<void>((resolve) => schedule(resolve, ms)),
		advance: async (ms) => {
			const target = now + ms
			while (true) {
				let nextId: number | null = null
				let nextTask: ScheduledTimer | null = null
				for (const [id, task] of timers) {
					if (task.fireAt > target) continue
					if (nextTask === null || task.fireAt < nextTask.fireAt) {
						nextId = id
						nextTask = task
					}
				}
				if (nextId === null || nextTask === null) break
				timers.delete(nextId)
				now = nextTask.fireAt
				nextTask.fn()
				await drainMicrotasks()
			}
			now = target
		},
		flush: drainMicrotasks,
		now: () => now,
	}
}

interface Harness {
	readonly clock: FakeClock
	readonly events: SystemThemeReloadEvent[]
	readonly applied: TerminalColors[]
	readonly notifyCount: { value: number }
	readonly reads: { value: number }
	readonly readQueue: TerminalColors[]
	readonly setAutoReload: (enabled: boolean) => void
	readonly reloader: ReturnType<typeof createSystemThemeReloader>
}

const setupHarness = (
	options: {
		readonly initialReads?: TerminalColors[]
		readonly defaultRead?: TerminalColors
		readonly enabled?: boolean
		readonly config?: Partial<{
			readonly debounceMs: number
			readonly readTimeoutMs: number
			readonly maxAttempts: number
			readonly retryDelayMs: number
		}>
	} = {},
): Harness => {
	const clock = createFakeClock()
	const events: SystemThemeReloadEvent[] = []
	const applied: TerminalColors[] = []
	const notifyCount = { value: 0 }
	const reads = { value: 0 }
	const readQueue = [...(options.initialReads ?? [])]
	let enabled = options.enabled ?? true

	const reloader = createSystemThemeReloader({
		readPalette: async () => {
			reads.value += 1
			return readQueue.length > 0 ? (readQueue.shift() as TerminalColors) : (options.defaultRead ?? NULL_PALETTE)
		},
		applyColors: (colors) => {
			applied.push(colors)
		},
		notify: () => {
			notifyCount.value += 1
		},
		isAutoReloadEnabled: async () => enabled,
		setTimer: clock.setTimer,
		clearTimer: clock.clearTimer,
		delay: clock.delay,
		onEvent: (event) => events.push(event),
		config: options.config,
	})

	return {
		clock,
		events,
		applied,
		notifyCount,
		reads,
		readQueue,
		setAutoReload: (next) => {
			enabled = next
		},
		reloader,
	}
}

describe("paletteSignature / hasCompletePalette", () => {
	test("complete palette is complete and has stable signature", () => {
		expect(hasCompletePalette(A)).toBe(true)
		expect(paletteSignature(A)).toBe(paletteSignature(A))
		expect(paletteSignature(A)).not.toBe(paletteSignature(B))
	})

	test("partial palette is rejected", () => {
		expect(hasCompletePalette(PARTIAL)).toBe(false)
		expect(hasCompletePalette(NULL_PALETTE)).toBe(false)
	})
})

describe("createSystemThemeReloader", () => {
	test("first complete read is applied on attempt 1", async () => {
		const h = setupHarness({ initialReads: [A] })

		h.reloader.requestReload()
		await h.clock.advance(200)
		await h.clock.flush()

		expect(h.applied).toEqual([A])
		expect(h.notifyCount.value).toBe(1)
		expect(h.reads.value).toBe(1)
		expect(h.events.some((e) => e.kind === "applied")).toBe(true)
	})

	test("waits across retries until palette changes from baseline", async () => {
		const h = setupHarness({ initialReads: [A, A, B] })
		await h.reloader.primeBaseline()

		h.reloader.requestReload()
		await h.clock.advance(200)
		await h.clock.flush()
		await h.clock.advance(200)
		await h.clock.flush()
		await h.clock.advance(200)
		await h.clock.flush()

		expect(h.applied).toEqual([B])
		expect(h.notifyCount.value).toBe(1)
		expect(h.reads.value).toBe(3)
	})

	test("does not apply when all reads match baseline (theme unchanged)", async () => {
		const h = setupHarness({ initialReads: [A, A, A, A], defaultRead: A })
		await h.reloader.primeBaseline()

		h.reloader.requestReload()
		await h.clock.advance(200)
		for (let i = 0; i < 5; i++) {
			await h.clock.advance(200)
			await h.clock.flush()
		}

		expect(h.applied).toEqual([])
		expect(h.notifyCount.value).toBe(0)
		const skip = h.events.find((e) => e.kind === "skipped")
		expect(skip?.kind === "skipped" && skip.reason).toBe("unchanged")
	})

	test("does not apply when terminal returns incomplete palette on every attempt", async () => {
		const h = setupHarness({ defaultRead: PARTIAL })

		h.reloader.requestReload()
		await h.clock.advance(200)
		for (let i = 0; i < 5; i++) {
			await h.clock.advance(200)
			await h.clock.flush()
		}

		expect(h.applied).toEqual([])
		expect(h.notifyCount.value).toBe(0)
		const skip = h.events.find((e) => e.kind === "skipped")
		expect(skip?.kind === "skipped" && skip.reason).toBe("incomplete")
	})

	test("debounces rapid signals into a single reload", async () => {
		const h = setupHarness({ initialReads: [A] })
		await h.reloader.primeBaseline()
		h.readQueue.push(B)

		h.reloader.requestReload()
		await h.clock.advance(50)
		h.reloader.requestReload()
		await h.clock.advance(50)
		h.reloader.requestReload()
		await h.clock.advance(300)
		await h.clock.flush()

		expect(h.reads.value).toBe(2)
		expect(h.applied).toEqual([B])
	})

	test("second signal during retry-wait cancels the first reload", async () => {
		const h = setupHarness({
			initialReads: [A, A, A, C],
			config: { retryDelayMs: 1000 },
		})
		await h.reloader.primeBaseline()

		h.reloader.requestReload()
		await h.clock.advance(200)
		await h.clock.flush()

		h.reloader.requestReload()
		await h.clock.advance(200)
		await h.clock.flush()

		await h.clock.advance(1000)
		await h.clock.flush()

		expect(h.applied).toEqual([C])
		expect(h.events.some((e) => e.kind === "skipped" && e.reason === "cancelled")).toBe(true)
	})

	test("skips when auto-reload is disabled", async () => {
		const h = setupHarness({ initialReads: [A], enabled: false })

		h.reloader.requestReload()
		await h.clock.advance(200)
		await h.clock.flush()

		expect(h.applied).toEqual([])
		expect(h.reads.value).toBe(0)
		const skip = h.events.find((e) => e.kind === "skipped")
		expect(skip?.kind === "skipped" && skip.reason).toBe("disabled")
	})

	test("primeBaseline does not apply or notify", async () => {
		const h = setupHarness({ initialReads: [A] })

		await h.reloader.primeBaseline()

		expect(h.applied).toEqual([])
		expect(h.notifyCount.value).toBe(0)
		expect(h.reads.value).toBe(1)
	})

	test("primeBaseline plus matching SIGUSR2 is treated as unchanged", async () => {
		const h = setupHarness({ initialReads: [A], defaultRead: A })

		await h.reloader.primeBaseline()
		h.reloader.requestReload()
		await h.clock.advance(200)
		for (let i = 0; i < 5; i++) {
			await h.clock.advance(200)
			await h.clock.flush()
		}

		expect(h.applied).toEqual([])
		const skip = h.events.find((e) => e.kind === "skipped")
		expect(skip?.kind === "skipped" && skip.reason).toBe("unchanged")
	})

	test("dispose cancels pending debounce", async () => {
		const h = setupHarness({ initialReads: [A] })

		h.reloader.requestReload()
		h.reloader.dispose()
		await h.clock.advance(500)
		await h.clock.flush()

		expect(h.applied).toEqual([])
		expect(h.reads.value).toBe(0)
	})
})
