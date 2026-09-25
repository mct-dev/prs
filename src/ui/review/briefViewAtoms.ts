import * as Atom from "effect/unstable/reactivity/Atom"
import { type ReviewEntry, reviewKey } from "../../review/briefStatus.js"
import { selectedPullRequestAtom } from "../pullRequests/atoms.js"
import { agentReviewIndexAtom } from "./indexAtom.js"

// `brief` is a full-screen PR view mode, a peer of `diff` / `runs` / `comments`.
// keepAlive: these outlive the brief view (e.g. while a focus-area diff is open),
// and an unsubscribed atom resets to its initial value.
export const briefFullViewAtom = Atom.make(false).pipe(Atom.keepAlive)

// Whether the brief view was opened from the detail view, so `esc` returns there.
export const briefReturnToDetailAtom = Atom.make(false).pipe(Atom.keepAlive)

// Cursor over the brief's focus areas, and the body's first visible row.
export const briefFocusIndexAtom = Atom.make(0).pipe(Atom.keepAlive)
export const briefScrollTopAtom = Atom.make(0).pipe(Atom.keepAlive)

/** Where `enter` on a focus area wants the diff to land once its files load. */
export interface BriefDiffTarget {
	readonly file: string
	readonly lines: string | null
}

/** A target parked for the diff view, tied to the PR and head commit the brief was made for. */
export interface PendingBriefDiffTarget extends BriefDiffTarget {
	readonly url: string
	readonly headSha: string
}

export const pendingBriefDiffTargetAtom = Atom.make<PendingBriefDiffTarget | null>(null).pipe(Atom.keepAlive)

/** The latest review run (record + decoded brief) for the selected PR. */
export const selectedReviewEntryAtom = Atom.make((get): ReviewEntry | null => {
	const pullRequest = get(selectedPullRequestAtom)
	if (!pullRequest) return null
	return get(agentReviewIndexAtom)[reviewKey(pullRequest.repository, pullRequest.number)] ?? null
})
