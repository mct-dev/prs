import { useEffect, type MutableRefObject } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { DiffCommentSide } from "../domain.js"
import type { DiffFilePatch, StackedDiffCommentAnchor } from "../ui/diff.js"
import { safeDiffFileIndex } from "../ui/diff.js"

export interface UseDiffSelectionSyncInput {
	readonly selectedIndex: number
	readonly selectedIssueIndex: number
	readonly selectedRepositoryIndex: number
	readonly readyDiffFiles: readonly DiffFilePatch[]
	readonly diffCommentAnchors: readonly StackedDiffCommentAnchor[]
	readonly diffFullView: boolean
	readonly selectedDiffCommentAnchor: StackedDiffCommentAnchor | null
	readonly detailPreviewScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly setDiffFileIndex: (next: number | ((current: number) => number)) => void
	readonly setDiffScrollTop: (next: number) => void
	readonly setDiffCommentAnchorIndex: (next: number | ((current: number) => number)) => void
	readonly setDiffPreferredSide: (next: DiffCommentSide | null) => void
	readonly setDiffCommentRangeStartIndex: (next: number | null | ((current: number | null) => number | null)) => void
}

/**
 * Five small synchronisation effects that keep diff-view selection
 * state consistent with the rest of the app:
 *   - Reset diff-view state and scroll detail preview when PR selection changes.
 *   - Scroll detail preview when issue/repo selection changes.
 *   - Clamp diff file index when the loaded diff set shrinks.
 *   - Clamp diff comment anchor + range start when anchor set changes.
 *   - Sync diff file index to the selected anchor while in diff view.
 *
 * Lives in its own hook so App.tsx doesn't carry five disjoint useEffects.
 */
export const useDiffSelectionSync = ({
	selectedIndex,
	selectedIssueIndex,
	selectedRepositoryIndex,
	readyDiffFiles,
	diffCommentAnchors,
	diffFullView,
	selectedDiffCommentAnchor,
	detailPreviewScrollRef,
	setDiffFileIndex,
	setDiffScrollTop,
	setDiffCommentAnchorIndex,
	setDiffPreferredSide,
	setDiffCommentRangeStartIndex,
}: UseDiffSelectionSyncInput): void => {
	useEffect(() => {
		setDiffFileIndex(0)
		setDiffScrollTop(0)
		setDiffCommentAnchorIndex(0)
		setDiffPreferredSide(null)
		setDiffCommentRangeStartIndex(null)
		detailPreviewScrollRef.current?.scrollTo({ x: 0, y: 0 })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedIndex])

	useEffect(() => {
		detailPreviewScrollRef.current?.scrollTo({ x: 0, y: 0 })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedIssueIndex, selectedRepositoryIndex])

	useEffect(() => {
		setDiffFileIndex((current) => safeDiffFileIndex(readyDiffFiles, current))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [readyDiffFiles.length])

	useEffect(() => {
		setDiffCommentAnchorIndex((current) => {
			if (diffCommentAnchors.length === 0) return 0
			return Math.max(0, Math.min(current, diffCommentAnchors.length - 1))
		})
		setDiffCommentRangeStartIndex((current) => {
			if (current === null || diffCommentAnchors.length === 0) return null
			return Math.max(0, Math.min(current, diffCommentAnchors.length - 1))
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [diffCommentAnchors.length])

	useEffect(() => {
		if (!diffFullView || !selectedDiffCommentAnchor) return
		setDiffFileIndex((current) => (current === selectedDiffCommentAnchor.fileIndex ? current : selectedDiffCommentAnchor.fileIndex))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [diffFullView, selectedDiffCommentAnchor?.fileIndex])
}
