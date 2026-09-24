import { context } from "@ghui/keymap"
import { countedVerticalBindings } from "./helpers.ts"

// The full brief view: ↑↓ walks focus areas (or scrolls when there are none),
// `enter` opens the diff at the focused file/line, `o` pages the agent log.

export interface BriefViewCtx {
	readonly halfPage: number
	readonly close: () => void
	readonly moveFocus: (delta: number) => void
	readonly scrollBy: (delta: number) => void
	readonly toBoundary: (boundary: "first" | "last") => void
	readonly openFocus: () => void
	readonly openLog: () => void
	readonly cancel: () => void
	readonly runReview: () => void
	readonly runReviewWithPreset: () => void
}

const Brief = context<BriefViewCtx>()

export const briefViewKeymap = Brief(
	{ id: "brief.escape", title: "Close brief", keys: ["escape"], run: (s) => s.close() },
	{ id: "brief.open-focus", title: "Open diff at focus area", keys: ["return", "right", "l"], run: (s) => s.openFocus() },

	{ id: "brief.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.scrollBy(-s.halfPage) },
	{ id: "brief.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d"], run: (s) => s.scrollBy(s.halfPage) },

	...countedVerticalBindings<BriefViewCtx>((s, delta) => s.moveFocus(delta)),

	{ id: "brief.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveFocus(-1) },
	{ id: "brief.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveFocus(1) },

	{ id: "brief.first", title: "Top", keys: ["g g"], run: (s) => s.toBoundary("first") },
	{ id: "brief.last", title: "Bottom", keys: ["shift+g"], run: (s) => s.toBoundary("last") },

	{ id: "brief.open-log", title: "Open agent log", keys: ["o"], run: (s) => s.openLog() },
	{ id: "brief.cancel", title: "Cancel agent review", keys: ["x"], run: (s) => s.cancel() },
	{ id: "brief.run", title: "Run agent review", keys: ["b"], run: (s) => s.runReview() },
	{ id: "brief.run-preset", title: "Run agent review with preset", keys: ["shift+b"], run: (s) => s.runReviewWithPreset() },
)
