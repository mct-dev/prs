import { describe, expect, test } from "bun:test"
import { createDispatcher } from "../src/dispatcher.ts"
import { parseKey } from "../src/keys.ts"
import { type Scrollable, scrollCommands } from "../src/scroll.ts"

interface Ctx extends Scrollable {
	readonly log: string[]
	readonly halfPage: number
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

describe("scrollCommands", () => {
	test("j/k scroll by one", () => {
		const ctx = makeCtx()
		const dispatcher = createDispatcher(scrollCommands<Ctx>(), () => ctx)
		dispatcher.dispatch(parseKey("j"))
		dispatcher.dispatch(parseKey("k"))
		expect(ctx.log).toEqual(["by:1", "by:-1"])
	})

	test("ctrl+u/d scroll by half page", () => {
		const ctx = makeCtx()
		const dispatcher = createDispatcher(scrollCommands<Ctx>(), () => ctx)
		dispatcher.dispatch(parseKey("ctrl+u"))
		dispatcher.dispatch(parseKey("ctrl+d"))
		expect(ctx.log).toEqual(["by:-10", "by:10"])
	})

	test("gg jumps to top", () => {
		const ctx = makeCtx()
		const dispatcher = createDispatcher(scrollCommands<Ctx>(), () => ctx)
		dispatcher.dispatch(parseKey("g"))
		dispatcher.dispatch(parseKey("g"))
		expect(ctx.log).toEqual(["to:0"])
	})

	test("shift+g jumps to bottom", () => {
		const ctx = makeCtx()
		const dispatcher = createDispatcher(scrollCommands<Ctx>(), () => ctx)
		dispatcher.dispatch(parseKey("shift+g"))
		expect(ctx.log).toEqual([`to:${Number.MAX_SAFE_INTEGER}`])
	})
})
