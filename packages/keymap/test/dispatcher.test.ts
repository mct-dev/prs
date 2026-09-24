import { beforeEach, describe, expect, test } from "bun:test"
import { command } from "../src/command.ts"
import { type Clock, createDispatcher } from "../src/dispatcher.ts"
import { Keymap } from "../src/keymap.ts"
import { parseKey } from "../src/keys.ts"

interface Ctx {
	readonly modal: boolean
	readonly enabledMerge: boolean
	readonly log: string[]
}

class FakeClock implements Clock {
	private nextHandle = 1
	private readonly timers = new Map<number, { fireAt: number; fn: () => void }>()
	private current = 0

	now() { return this.current }

	setTimeout(fn: () => void, ms: number) {
		const handle = this.nextHandle++
		this.timers.set(handle, { fireAt: this.current + ms, fn })
		return handle
	}

	clearTimeout(handle: unknown) {
		this.timers.delete(handle as number)
	}

	advance(ms: number) {
		this.current += ms
		const due = [...this.timers].filter(([_, t]) => t.fireAt <= this.current)
		for (const [handle, { fn }] of due) {
			this.timers.delete(handle)
			fn()
		}
	}
}

let ctx: Ctx
const setCtx = (next: Partial<Ctx>) => { ctx = { ...ctx, ...next } }
beforeEach(() => { ctx = { modal: false, enabledMerge: true, log: [] } })

const press = (dispatcher: ReturnType<typeof createDispatcher<Ctx>>, key: string) =>
	dispatcher.dispatch(parseKey(key))

describe("createDispatcher — basic", () => {
	test("dispatches a bound binding and runs its action", () => {
		const km = command<Ctx>({ id: "refresh", title: "Refresh", keys: ["r"], run: (s) => s.log.push("ran") })
		const dispatcher = createDispatcher(km, () => ctx)
		expect(press(dispatcher, "r").kind).toBe("ran")
		expect(ctx.log).toEqual(["ran"])
	})

	test("unbound key returns no-match", () => {
		const dispatcher = createDispatcher(Keymap.empty<Ctx>(), () => ctx)
		expect(press(dispatcher, "r").kind).toBe("no-match")
	})

	test("disabled with reason returns disabled (no action fired)", () => {
		const km = command<Ctx>({
			id: "merge",
			title: "Merge",
			keys: ["m"],
			enabled: (s) => s.enabledMerge ? true : "Select first.",
			run: (s) => s.log.push("ran"),
		})
		const dispatcher = createDispatcher(km, () => ctx)
		setCtx({ enabledMerge: false })
		const result = press(dispatcher, "m")
		expect(result.kind).toBe("disabled")
		if (result.kind === "disabled") expect(result.reason).toBe("Select first.")
		expect(ctx.log).toEqual([])
	})

	test("when=false → no-match (silent)", () => {
		const km = command<Ctx>({
			id: "modal",
			title: "Modal",
			keys: ["m"],
			when: (s) => s.modal,
			run: (s) => s.log.push("ran"),
		})
		const dispatcher = createDispatcher(km, () => ctx)
		expect(press(dispatcher, "m").kind).toBe("no-match")
	})
})

describe("createDispatcher — runById", () => {
	test("runs a command by its meta.id", () => {
		const km = command<Ctx>({ id: "refresh", title: "Refresh", keys: ["r"], run: (s) => s.log.push("ran") })
		const dispatcher = createDispatcher(km, () => ctx)
		const result = dispatcher.runById("refresh")
		expect(result.kind).toBe("ran")
		expect(ctx.log).toEqual(["ran"])
	})

	test("unknown id returns no-match", () => {
		const km = command<Ctx>({ id: "x", title: "X", keys: ["x"], run: () => {} })
		const dispatcher = createDispatcher(km, () => ctx)
		expect(dispatcher.runById("nope").kind).toBe("no-match")
	})

	test("disabled command via runById returns disabled with reason", () => {
		const km = command<Ctx>({
			id: "merge",
			title: "Merge",
			keys: ["m"],
			enabled: (s) => s.enabledMerge ? true : "Select first.",
			run: (s) => s.log.push("ran"),
		})
		const dispatcher = createDispatcher(km, () => ctx)
		setCtx({ enabledMerge: false })
		const result = dispatcher.runById("merge")
		expect(result.kind).toBe("disabled")
		if (result.kind === "disabled") expect(result.reason).toBe("Select first.")
	})

	test("works for commands with no bound keys (palette-only)", () => {
		const km = command<Ctx>({ id: "settings", title: "Settings", keys: [], run: (s) => s.log.push("settings") })
		const dispatcher = createDispatcher(km, () => ctx)
		expect(dispatcher.runById("settings").kind).toBe("ran")
		expect(ctx.log).toEqual(["settings"])
	})
})

describe("createDispatcher — sequences and ambiguity", () => {
	test("two-stroke binding fires after both strokes", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: (s) => s.log.push("top") })
		const dispatcher = createDispatcher(km, () => ctx)
		expect(press(dispatcher, "g").kind).toBe("pending")
		expect(press(dispatcher, "g").kind).toBe("ran")
		expect(ctx.log).toEqual(["top"])
	})

	test("ambiguous: 'g' and 'g g' both bound, timeout commits to single", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "single", title: "Single", keys: ["g"], run: (s) => s.log.push("single") }),
			command<Ctx>({ id: "double", title: "Double", keys: ["g g"], run: (s) => s.log.push("double") }),
		)
		const clock = new FakeClock()
		const dispatcher = createDispatcher(km, () => ctx, { clock, disambiguationTimeoutMs: 500 })
		press(dispatcher, "g")
		expect(ctx.log).toEqual([])
		clock.advance(501)
		expect(ctx.log).toEqual(["single"])
	})

	test("ambiguous: second g fires the sequence before timeout", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "single", title: "Single", keys: ["g"], run: (s) => s.log.push("single") }),
			command<Ctx>({ id: "double", title: "Double", keys: ["g g"], run: (s) => s.log.push("double") }),
		)
		const clock = new FakeClock()
		const dispatcher = createDispatcher(km, () => ctx, { clock, disambiguationTimeoutMs: 500 })
		press(dispatcher, "g")
		clock.advance(100)
		press(dispatcher, "g")
		expect(ctx.log).toEqual(["double"])
	})

	test("non-matching mid-sequence drops pending and re-dispatches the new key", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} }),
			command<Ctx>({ id: "refresh", title: "Refresh", keys: ["r"], run: (s) => s.log.push("refresh") }),
		)
		const dispatcher = createDispatcher(km, () => ctx)
		press(dispatcher, "g")
		expect(press(dispatcher, "r").kind).toBe("ran")
		expect(ctx.log).toEqual(["refresh"])
	})
})

describe("createDispatcher — observable state", () => {
	test("getState() exposes pending + timeoutAt", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const clock = new FakeClock()
		const dispatcher = createDispatcher(km, () => ctx, { clock, disambiguationTimeoutMs: 500 })
		expect(dispatcher.getState()).toEqual({ pending: [], timeoutAt: null })
		press(dispatcher, "g")
		expect(dispatcher.getState().pending).toHaveLength(1)
		expect(dispatcher.getState().timeoutAt).toBe(500)
	})

	test("onStateChange fires on transitions", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const dispatcher = createDispatcher(km, () => ctx)
		const states: number[] = []
		dispatcher.onStateChange((s) => states.push(s.pending.length))
		press(dispatcher, "g")
		press(dispatcher, "g")
		expect(states).toEqual([1, 0])
	})

	test("clearPending notifies subscribers", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const dispatcher = createDispatcher(km, () => ctx)
		const states: number[] = []
		dispatcher.onStateChange((s) => states.push(s.pending.length))
		press(dispatcher, "g")
		dispatcher.clearPending()
		expect(states).toEqual([1, 0])
	})

	test("unsubscribed listener stops receiving updates", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const dispatcher = createDispatcher(km, () => ctx)
		const states: number[] = []
		const off = dispatcher.onStateChange((s) => states.push(s.pending.length))
		press(dispatcher, "g")
		off()
		press(dispatcher, "g")
		expect(states).toEqual([1])
	})
})

describe("createDispatcher — collision detection", () => {
	test("calls onCollision when two active bindings share the same sequence", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "a", title: "A", keys: ["x"], run: (s) => s.log.push("a") }),
			command<Ctx>({ id: "b", title: "B", keys: ["x"], run: (s) => s.log.push("b") }),
		)
		const collisions: number[] = []
		const dispatcher = createDispatcher(km, () => ctx, {
			onCollision: (_, bindings) => collisions.push(bindings.length),
		})
		press(dispatcher, "x")
		expect(collisions).toEqual([2])
		expect(ctx.log).toEqual(["a"])
	})

	test("no collision when scopes are exclusive via when", () => {
		const km = Keymap.union(
			command<Ctx>({
				id: "modal",
				title: "M",
				keys: ["x"],
				when: (s) => s.modal,
				run: (s) => s.log.push("modal"),
			}),
			command<Ctx>({
				id: "global",
				title: "G",
				keys: ["x"],
				when: (s) => !s.modal,
				run: (s) => s.log.push("global"),
			}),
		)
		const collisions: number[] = []
		const dispatcher = createDispatcher(km, () => ctx, {
			onCollision: (_, bindings) => collisions.push(bindings.length),
		})
		press(dispatcher, "x")
		setCtx({ modal: true })
		press(dispatcher, "x")
		expect(ctx.log).toEqual(["global", "modal"])
		expect(collisions).toEqual([])
	})
})
