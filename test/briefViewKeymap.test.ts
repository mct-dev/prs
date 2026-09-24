import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { type BriefViewCtx, briefViewKeymap } from "../src/keymap/briefView.ts"

describe("brief view keymap", () => {
	test("o opens the PR in the browser and L pages the agent log", () => {
		const calls: string[] = []
		const ctx: BriefViewCtx = {
			halfPage: 5,
			close: () => calls.push("close"),
			moveFocus: () => calls.push("move"),
			scrollBy: () => calls.push("scroll"),
			toBoundary: () => calls.push("boundary"),
			openFocus: () => calls.push("focus"),
			openLog: () => calls.push("log"),
			openInBrowser: () => calls.push("browser"),
			cancel: () => calls.push("cancel"),
			runReview: () => calls.push("run"),
			runReviewWithPreset: () => calls.push("preset"),
		}
		const dispatcher = createDispatcher(briefViewKeymap, () => ctx)
		dispatcher.dispatch(parseKey("o"))
		dispatcher.dispatch(parseKey("shift+l"))
		expect(calls).toEqual(["browser", "log"])
	})
})
