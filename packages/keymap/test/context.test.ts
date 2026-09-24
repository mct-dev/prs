import { describe, expect, test } from "bun:test"
import { context } from "../src/context.ts"
import { createDispatcher } from "../src/dispatcher.ts"
import { Keymap } from "../src/keymap.ts"
import { parseKey } from "../src/keys.ts"

interface Ctx {
	readonly log: string[]
	readonly halfPage: number
	readonly scrollBy: (delta: number) => void
	readonly scrollTo: (line: number) => void
}

const makeCtx = (): Ctx => {
	const ctx: Ctx = {
		log: [],
		halfPage: 10,
		scrollBy: (delta) => ctx.log.push(`by:${delta}`),
		scrollTo: (line) => ctx.log.push(`to:${line}`),
	}
	return ctx
}

describe("context<C>()", () => {
	test("accepts CommandConfig items, types `s` as C without per-call annotation", () => {
		const ctx = makeCtx()
		const Ctx = context<Ctx>()
		const km = Ctx(
			{ id: "x", title: "X", keys: ["x"], run: (s) => s.scrollBy(1) },
			{ id: "y", title: "Y", keys: ["y"], run: (s) => s.scrollBy(-1) },
		)
		const dispatcher = createDispatcher(km, () => ctx)
		dispatcher.dispatch(parseKey("x"))
		dispatcher.dispatch(parseKey("y"))
		expect(ctx.log).toEqual(["by:1", "by:-1"])
	})

	test("accepts existing Keymap<C> items and unions them in", () => {
		const ctx = makeCtx()
		const Ctx = context<Ctx>()
		const sub = Ctx(
			{ id: "k", title: "K", keys: ["k"], run: (s) => s.scrollBy(-1) },
		)
		const km = Ctx(
			sub,
			{ id: "j", title: "J", keys: ["j"], run: (s) => s.scrollBy(1) },
		)
		const dispatcher = createDispatcher(km, () => ctx)
		dispatcher.dispatch(parseKey("k"))
		dispatcher.dispatch(parseKey("j"))
		expect(ctx.log).toEqual(["by:-1", "by:1"])
	})

	test("mixes configs and sub-keymaps freely", () => {
		const ctx = makeCtx()
		const Ctx = context<Ctx>()
		const km = Ctx(
			{ id: "a", title: "A", keys: ["a"], run: (s) => s.log.push("a") },
			Ctx({ id: "b", title: "B", keys: ["b"], run: (s) => s.log.push("b") }),
			{ id: "c", title: "C", keys: ["c"], run: (s) => s.log.push("c") },
		)
		const dispatcher = createDispatcher(km, () => ctx)
		dispatcher.dispatch(parseKey("a"))
		dispatcher.dispatch(parseKey("b"))
		dispatcher.dispatch(parseKey("c"))
		expect(ctx.log).toEqual(["a", "b", "c"])
	})

	test("zero arguments returns an empty Keymap", () => {
		const Ctx = context<Ctx>()
		const km = Ctx()
		expect(km).toBeInstanceOf(Keymap)
		expect(km.bindings).toHaveLength(0)
	})
})
