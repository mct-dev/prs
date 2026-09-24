import * as Atom from "effect/unstable/reactivity/Atom"

// "Transitional" runtime snapshot — App.tsx mirrors these computed values
// into this atom on every render via a useEffect. Command derivation atoms
// then read from here for the gating reasons that depend on diff anchors,
// comment selection, etc.
//
// Why: each value comes from a useMemo over hook-local state (contentWidth,
// readyDiffFiles, diffCommentAnchors, selectedOrderedComment, …) whose
// underlying inputs aren't all atoms yet. Lifting every input would require
// pulling contentWidth and the diff layout pipeline into atom-land. That's
// a real refactor; for now we accept the indirection so the new command
// registry doesn't need closure-passed values.
//
// Long term, each of these should become a true derived atom — but doing
// that requires getting contentWidth + the diff layout computation off
// useMemo first. This atom is the seam where that work would land.

export interface CommandRuntimeSnapshot {
	readonly readyDiffFileCount: number
	readonly diffFileIndex: number
	readonly selectedDiffCommentAnchorLabel: string | null
	readonly selectedDiffCommentThreadCount: number
	readonly hasDiffCommentThreads: boolean
	readonly diffRangeActive: boolean
	readonly hasSelectedComment: boolean
	readonly canEditSelectedComment: boolean
}

const initialSnapshot: CommandRuntimeSnapshot = {
	readyDiffFileCount: 0,
	diffFileIndex: 0,
	selectedDiffCommentAnchorLabel: null,
	selectedDiffCommentThreadCount: 0,
	hasDiffCommentThreads: false,
	diffRangeActive: false,
	hasSelectedComment: false,
	canEditSelectedComment: false,
}

export const commandRuntimeAtom = Atom.make<CommandRuntimeSnapshot>(initialSnapshot).pipe(Atom.keepAlive)
