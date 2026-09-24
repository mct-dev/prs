import { useAtom } from "@effect/atom-react"
import { useEffect, useRef } from "react"
import type { StackedDiffCommentAnchor } from "../diff.js"
import { pendingBriefDiffTargetAtom } from "./briefViewAtoms.js"
import { resolveBriefDiffTarget } from "./briefViewRows.js"

const LAYOUT_RETRY_MS = 16
const LAYOUT_RETRY_ATTEMPTS = 6

export const STALE_BRIEF_NOTICE = "brief is stale; line numbers may be off"

/**
 * Lands the diff on a brief focus area once the diff has loaded: `brief.open-focus`
 * parks the target in `pendingBriefDiffTargetAtom` and opens the diff; this
 * selects the matching file and the nearest new-side line, then re-asserts the
 * scroll for a few frames while the stacked diff lays out. With no line to land
 * on (no line hint, no anchors in the file, or a brief made for an older head)
 * it scrolls to the top of the file instead.
 */
export const useBriefDiffTarget = ({
	selectedPullRequestUrl,
	selectedHeadSha,
	diffFullView,
	readyDiffFiles,
	diffCommentAnchors,
	setDiffFileIndex,
	setDiffCommentAnchorIndex,
	ensureDiffLineVisible,
	scrollToDiffFile,
	flashNotice,
}: {
	readonly selectedPullRequestUrl: string | null
	readonly selectedHeadSha: string | null
	readonly diffFullView: boolean
	readonly readyDiffFiles: readonly { readonly name: string }[]
	readonly diffCommentAnchors: readonly StackedDiffCommentAnchor[]
	readonly setDiffFileIndex: (index: number) => void
	readonly setDiffCommentAnchorIndex: (index: number) => void
	readonly ensureDiffLineVisible: (line: number) => void
	readonly scrollToDiffFile: (fileIndex: number) => void
	readonly flashNotice: (message: string) => void
}) => {
	const [pending, setPending] = useAtom(pendingBriefDiffTargetAtom)
	// Held in a ref: clearing `pending` re-runs the effect, which must not cancel the settle loop.
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(
		() => () => {
			if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		},
		[],
	)

	useEffect(() => {
		if (!pending) return
		// A target left over from another PR (e.g. its diff never loaded) is dropped, not applied here.
		if (pending.url !== selectedPullRequestUrl) {
			setPending(null)
			return
		}
		if (!diffFullView || readyDiffFiles.length === 0) return
		setPending(null)
		const resolved = resolveBriefDiffTarget(pending, readyDiffFiles, diffCommentAnchors)
		if (!resolved) {
			flashNotice(`Not in this diff: ${pending.file}`)
			return
		}
		const stale = selectedHeadSha !== null && selectedHeadSha.length > 0 && pending.headSha !== selectedHeadSha
		if (stale) flashNotice(STALE_BRIEF_NOTICE)
		const anchorIndex = stale ? -1 : (resolved.anchorIndex ?? diffCommentAnchors.findIndex((anchor) => anchor.fileIndex === resolved.fileIndex))
		setDiffFileIndex(resolved.fileIndex)
		if (anchorIndex >= 0) setDiffCommentAnchorIndex(anchorIndex)
		const line = anchorIndex >= 0 ? diffCommentAnchors[anchorIndex]!.renderLine : null
		let attempts = 0
		const settle = () => {
			attempts++
			if (line === null) scrollToDiffFile(resolved.fileIndex)
			else ensureDiffLineVisible(line)
			timeoutRef.current = attempts < LAYOUT_RETRY_ATTEMPTS ? setTimeout(settle, LAYOUT_RETRY_MS) : null
		}
		if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(settle, 0)
		// Runs when the target is parked and again once the diff's files arrive.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pending, selectedPullRequestUrl, diffFullView, readyDiffFiles.length])
}
