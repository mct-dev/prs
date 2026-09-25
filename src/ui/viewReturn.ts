import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { detailFullViewAtom } from "./detail/atoms.js"
import { briefFullViewAtom } from "./review/briefViewAtoms.js"

/**
 * Where a full-screen view (diff, runs) was opened from, so `esc` returns there
 * instead of dropping to the list. The brief keeps its own focus and scroll
 * atoms untouched while the diff is up, so restoring the flag is enough.
 */
export type ReturnView = "brief" | "detail"

// keepAlive: only commands read these, and an unsubscribed atom resets to null before esc.
export const diffReturnViewAtom = Atom.make<ReturnView | null>(null).pipe(Atom.keepAlive)
export const runsReturnViewAtom = Atom.make<ReturnView | null>(null).pipe(Atom.keepAlive)

/** The view the user sees right now, read before an open clears the flags. */
export const currentReturnView = Effect.gen(function* () {
	if (yield* Atom.get(briefFullViewAtom)) return "brief" as const
	if (yield* Atom.get(detailFullViewAtom)) return "detail" as const
	return null
})

/** Re-shows the recorded origin view and clears the record. */
export const restoreReturnView = (origin: Atom.Writable<ReturnView | null>) =>
	Effect.gen(function* () {
		const view = yield* Atom.get(origin)
		yield* Atom.set(origin, null)
		if (view === "brief") yield* Atom.set(briefFullViewAtom, true)
		else if (view === "detail") yield* Atom.set(detailFullViewAtom, true)
	})
