import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
	diffCommentAnchorIndexAtom,
	diffCommentRangeStartIndexAtom,
	diffCommentThreadsAtom,
	diffCommentsLoadedAtom,
	diffFileIndexAtom,
	diffPreferredSideAtom,
	diffRenderViewAtom,
	diffScrollTopAtom,
	diffWhitespaceModeAtom,
	diffWrapModeAtom,
	pullRequestDiffCacheAtom,
} from "../ui/diff/atoms.js"

/**
 * Diff-view atom subscriptions bundled into one hook. The bulk of the
 * diff state lives in `ui/diff/atoms.ts`; this hook gives App.tsx a
 * single named seam to read and write them through.
 */
export const useDiffViewState = () => {
	const [diffFileIndex, setDiffFileIndex] = useAtom(diffFileIndexAtom)
	const [diffScrollTop, setDiffScrollTop] = useAtom(diffScrollTopAtom)
	const [diffRenderView, setDiffRenderView] = useAtom(diffRenderViewAtom)
	const diffWrapMode = useAtomValue(diffWrapModeAtom)
	const diffWhitespaceMode = useAtomValue(diffWhitespaceModeAtom)
	const [diffCommentAnchorIndex, setDiffCommentAnchorIndex] = useAtom(diffCommentAnchorIndexAtom)
	const [diffPreferredSide, setDiffPreferredSide] = useAtom(diffPreferredSideAtom)
	const [diffCommentRangeStartIndex, setDiffCommentRangeStartIndex] = useAtom(diffCommentRangeStartIndexAtom)
	const [diffCommentThreads, setDiffCommentThreads] = useAtom(diffCommentThreadsAtom)
	const setDiffCommentsLoaded = useAtomSet(diffCommentsLoadedAtom)
	const setPullRequestDiffCache = useAtomSet(pullRequestDiffCacheAtom)
	return {
		diffFileIndex,
		setDiffFileIndex,
		diffScrollTop,
		setDiffScrollTop,
		diffRenderView,
		setDiffRenderView,
		diffWrapMode,
		diffWhitespaceMode,
		diffCommentAnchorIndex,
		setDiffCommentAnchorIndex,
		diffPreferredSide,
		setDiffPreferredSide,
		diffCommentRangeStartIndex,
		setDiffCommentRangeStartIndex,
		diffCommentThreads,
		setDiffCommentThreads,
		setDiffCommentsLoaded,
		setPullRequestDiffCache,
	}
}
