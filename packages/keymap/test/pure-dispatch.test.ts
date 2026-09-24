import { describe, expect, test } from "bun:test"
import { command } from "../src/command.ts"
import { Keymap } from "../src/keymap.ts"
import { parseKey } from "../src/keys.ts"
import {
	type DispatchState,
	initialDispatchState,
	pureDispatch,
	pureTick,
} from "../src/pure-dispatch.ts"

interface Ctx {
	readonly log: string[]
	readonly modal: boolean
}

const ctx = (overrides: Partial<Ctx> = {}): Ctx => ({ log: [], modal: false, ...overrides })

describe("pureDispatch", () => {
	test("single-key match returns ran decision and resets state", () => {
		const km = command<Ctx>({ id: "x", title: "X", keys: ["x"], run: () => {} })
		const { state, decision } = pureDispatch(km, initialDispatchState, parseKey("x"), ctx(), 0)
		expect(decision.kind).toBe("ran")
		expect(state).toEqual(initialDispatchState)
	})

	test("no match from empty pending → no-match", () => {
		const km = Keymap.empty<Ctx>()
		const { state, decision } = pureDispatch(km, initialDispatchState, parseKey("x"), ctx(), 0)
		expect(decision.kind).toBe("no-match")
		expect(state).toEqual(initialDispatchState)
	})

	test("first stroke of sequence → pending with timeoutAt set", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const { state, decision } = pureDispatch(km, initialDispatchState, parseKey("g"), ctx(), 1000, { disambiguationTimeoutMs: 500 })
		expect(decision.kind).toBe("pending")
		expect(state.pending).toHaveLength(1)
		expect(state.timeoutAt).toBe(1500)
	})

	test("completing sequence → ran, state cleared", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const intermediate = pureDispatch(km, initialDispatchState, parseKey("g"), ctx(), 0).state
		const { state, decision } = pureDispatch(km, intermediate, parseKey("g"), ctx(), 100)
		expect(decision.kind).toBe("ran")
		expect(state).toEqual(initialDispatchState)
	})

	test("non-matching mid-sequence → re-dispatch fresh", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} }),
			command<Ctx>({ id: "refresh", title: "Refresh", keys: ["r"], run: () => {} }),
		)
		const intermediate = pureDispatch(km, initialDispatchState, parseKey("g"), ctx(), 0).state
		const { state, decision } = pureDispatch(km, intermediate, parseKey("r"), ctx(), 100)
		expect(decision.kind).toBe("ran")
		if (decision.kind === "ran") expect(decision.binding.meta?.id).toBe("refresh")
		expect(state).toEqual(initialDispatchState)
	})

	test("non-matching with no fallback from empty pending → no-match", () => {
		const km = command<Ctx>({ id: "top", title: "Top", keys: ["g g"], run: () => {} })
		const { state, decision } = pureDispatch(km, initialDispatchState, parseKey("x"), ctx(), 0)
		expect(decision.kind).toBe("no-match")
		expect(state).toEqual(initialDispatchState)
	})

	test("disabled with reason returns disabled decision (not ran)", () => {
		const km = command<Ctx>({
			id: "merge",
			title: "Merge",
			keys: ["m"],
			enabled: () => "Select first.",
			run: () => {},
		})
		const { decision } = pureDispatch(km, initialDispatchState, parseKey("m"), ctx(), 0)
		expect(decision.kind).toBe("disabled")
		if (decision.kind === "disabled") expect(decision.reason).toBe("Select first.")
	})

	test("when=false → invisible (no-match)", () => {
		const km = command<Ctx>({
			id: "modal",
			title: "Modal",
			keys: ["m"],
			when: (s) => s.modal,
			run: () => {},
		})
		const { decision } = pureDispatch(km, initialDispatchState, parseKey("m"), ctx({ modal: false }), 0)
		expect(decision.kind).toBe("no-match")
	})

	test("ambiguous (exact + continuing) sets pending + timeoutAt", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "single", title: "Single", keys: ["g"], run: () => {} }),
			command<Ctx>({ id: "double", title: "Double", keys: ["g g"], run: () => {} }),
		)
		const { state, decision } = pureDispatch(km, initialDispatchState, parseKey("g"), ctx(), 1000, { disambiguationTimeoutMs: 500 })
		expect(decision.kind).toBe("pending")
		expect(state.pending).toHaveLength(1)
		expect(state.timeoutAt).toBe(1500)
	})

	test("pure: same inputs, same outputs", () => {
		const km = command<Ctx>({ id: "x", title: "X", keys: ["x"], run: () => {} })
		const a = pureDispatch(km, initialDispatchState, parseKey("x"), ctx(), 0)
		const b = pureDispatch(km, initialDispatchState, parseKey("x"), ctx(), 0)
		expect(a).toEqual(b)
	})
})

describe("pureTick", () => {
	test("no timeoutAt → no-op", () => {
		const km = Keymap.empty<Ctx>()
		const { state, decision } = pureTick(km, initialDispatchState, ctx(), 100)
		expect(state).toEqual(initialDispatchState)
		expect(decision).toBeNull()
	})

	test("now < timeoutAt → no-op", () => {
		const km = command<Ctx>({ id: "x", title: "X", keys: ["g g"], run: () => {} })
		const intermediate: DispatchState = { pending: [parseKey("g")], timeoutAt: 1500 }
		const { state, decision } = pureTick(km, intermediate, ctx(), 1000)
		expect(state).toEqual(intermediate)
		expect(decision).toBeNull()
	})

	test("now >= timeoutAt with ambiguous match fires the exact binding and clears state", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "single", title: "Single", keys: ["g"], run: () => {} }),
			command<Ctx>({ id: "double", title: "Double", keys: ["g g"], run: () => {} }),
		)
		const intermediate: DispatchState = { pending: [parseKey("g")], timeoutAt: 1500 }
		const { state, decision } = pureTick(km, intermediate, ctx(), 1500)
		expect(decision?.kind).toBe("ran")
		if (decision?.kind === "ran") expect(decision.binding.meta?.id).toBe("single")
		expect(state).toEqual(initialDispatchState)
	})

	test("now >= timeoutAt with no exact match → no-match, state cleared", () => {
		const km = command<Ctx>({ id: "double", title: "Double", keys: ["g g"], run: () => {} })
		const intermediate: DispatchState = { pending: [parseKey("g")], timeoutAt: 1500 }
		const { state, decision } = pureTick(km, intermediate, ctx(), 1500)
		expect(decision?.kind).toBe("no-match")
		expect(state).toEqual(initialDispatchState)
	})

	test("recomputes match against current ctx (not at dispatch time)", () => {
		// Sequence pending; user state changes such that "g" was bound when pending
		// started but is no longer active when the timeout fires. Pure tick should
		// reflect the latest ctx.
		const km = Keymap.union(
			command<Ctx>({
				id: "single",
				title: "Single",
				keys: ["g"],
				when: (s) => s.modal,  // only active when modal=true
				run: () => {},
			}),
			command<Ctx>({ id: "double", title: "Double", keys: ["g g"], run: () => {} }),
		)
		const intermediate: DispatchState = { pending: [parseKey("g")], timeoutAt: 100 }
		const { decision } = pureTick(km, intermediate, ctx({ modal: false }), 100)
		expect(decision?.kind).toBe("no-match")
	})
})
