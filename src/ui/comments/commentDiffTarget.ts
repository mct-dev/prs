import * as Atom from "effect/unstable/reactivity/Atom"
import type { DiffCommentSide } from "../../domain.js"
import type { DiffFileSection, StackedDiffFilePatch } from "../diff.js"

/** A review comment the diff should land on once its files and threads load. */
export interface PendingCommentDiffTarget {
	// The PR the comment belongs to; a target for another PR is dropped.
	readonly url: string
	readonly path: string
	readonly side: DiffCommentSide
	readonly line: number
	// Same key as `diffCommentThreadsAtom`.
	readonly threadKey: string
}

export const pendingCommentDiffTargetAtom = Atom.make<PendingCommentDiffTarget | null>(null)

interface ResolvableAnchor {
	readonly fileIndex: number
	readonly side: DiffCommentSide
	readonly line: number
	readonly renderLine: number
}

export interface ResolvedCommentDiffTarget {
	readonly fileIndex: number
	// The anchor the thread hangs under; null for file-level and outdated
	// threads, which sit in the block above the file's first line.
	readonly anchorIndex: number | null
	// Stacked render lines of the thread block, when it is laid out.
	readonly threadTop: number | null
	readonly threadBottom: number | null
}

type ThreadsSection = Extract<DiffFileSection, { kind: "threads" }>

export const resolveCommentDiffTarget = (
	target: Pick<PendingCommentDiffTarget, "path" | "side" | "line" | "threadKey">,
	stackedFiles: readonly StackedDiffFilePatch[],
	anchors: readonly ResolvableAnchor[],
): ResolvedCommentDiffTarget | null => {
	const file = stackedFiles.find((candidate) => candidate.file.name === target.path)
	if (!file) return null
	const section = file.sections.find((candidate): candidate is ThreadsSection => candidate.kind === "threads" && candidate.keys.includes(target.threadKey))
	const onLine = section?.placement !== "file"
	const anchorIndex = onLine ? anchors.findIndex((anchor) => anchor.fileIndex === file.index && anchor.side === target.side && anchor.line === target.line) : -1
	return {
		fileIndex: file.index,
		anchorIndex: anchorIndex >= 0 ? anchorIndex : null,
		threadTop: section ? section.top : null,
		threadBottom: section ? section.top + section.height - 1 : null,
	}
}
