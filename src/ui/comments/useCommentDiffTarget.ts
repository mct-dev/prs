import { useAtom, useAtomValue } from "@effect/atom-react"
import { useEffect, useRef } from "react"
import { registerHandoff } from "../../commands/handoffs.js"
import { isReviewComment, type PullRequestComment, type PullRequestItem } from "../../domain.js"
import type { StackedDiffCommentAnchor, StackedDiffFilePatch } from "../diff.js"
import { diffCommentsLoadedAtom } from "../diff/atoms.js"
import { diffCommentThreadKey } from "../diff/comments.js"
import { diffThreadToggledAtom } from "../diff/threadAtoms.js"
import { setDiffThreadsExpanded, type DiffThread } from "../diff/threads.js"
import { pendingCommentDiffTargetAtom, resolveCommentDiffTarget } from "./commentDiffTarget.js"

const LAYOUT_RETRY_MS = 16
const LAYOUT_RETRY_ATTEMPTS = 6

export interface UseCommentDiffTargetInput {
	readonly selectedPullRequest: PullRequestItem | null
	readonly selectedOrderedComment: PullRequestComment | null
	readonly selectedDiffKey: string | null
	readonly diffFullView: boolean
	readonly stackedDiffFiles: readonly StackedDiffFilePatch[]
	readonly diffCommentAnchors: readonly StackedDiffCommentAnchor[]
	readonly diffThreads: ReadonlyMap<string, readonly DiffThread[]>
	readonly openDiffView: () => void
	readonly setDiffFileIndex: (index: number) => void
	readonly setDiffCommentAnchorIndex: (index: number) => void
	readonly ensureDiffLineVisible: (line: number) => void
	readonly scrollToDiffFile: (fileIndex: number) => void
	readonly flashNotice: (message: string) => void
}

/**
 * `d` / `enter` on a review comment in the comments view: open the diff,
 * expand the comment's thread and land on it. The target is parked in
 * `pendingCommentDiffTargetAtom` until the diff's files and review threads
 * have loaded, then the scroll is re-asserted for a few frames while the
 * stacked diff lays out.
 */
export const useCommentDiffTarget = (input: UseCommentDiffTargetInput) => {
	const { selectedPullRequest, selectedOrderedComment, selectedDiffKey, diffFullView, stackedDiffFiles, diffThreads } = input
	const [pending, setPending] = useAtom(pendingCommentDiffTargetAtom)
	const [toggled, setToggled] = useAtom(diffThreadToggledAtom)
	const commentsLoaded = useAtomValue(diffCommentsLoadedAtom)
	// The settle loop reads the latest layout, which moves once the thread expands.
	const latest = useRef(input)
	latest.current = input
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(
		() => () => {
			if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		},
		[],
	)

	const openSelectedCommentInDiff = () => {
		const comment = selectedOrderedComment
		if (!selectedPullRequest || !comment || !isReviewComment(comment)) {
			input.flashNotice("Not a file comment")
			return
		}
		setPending({ url: selectedPullRequest.url, path: comment.path, side: comment.side, line: comment.line, threadKey: diffCommentThreadKey(selectedPullRequest, comment) })
		input.openDiffView()
	}
	useEffect(() => registerHandoff("openSelectedCommentInDiff", openSelectedCommentInDiff))

	const threadsReady = selectedDiffKey !== null && commentsLoaded[selectedDiffKey] === "ready"
	useEffect(() => {
		if (!pending) return
		if (pending.url !== selectedPullRequest?.url) {
			setPending(null)
			return
		}
		if (!diffFullView || stackedDiffFiles.length === 0 || !threadsReady) return
		setPending(null)
		const thread = [...diffThreads.values()].flat().find((candidate) => candidate.key === pending.threadKey)
		if (thread) setToggled(setDiffThreadsExpanded([thread], true, toggled))
		const settle = (attempt: number) => {
			const current = latest.current
			const resolved = resolveCommentDiffTarget(pending, current.stackedDiffFiles, current.diffCommentAnchors)
			if (!resolved) {
				current.flashNotice(`Not in this diff: ${pending.path}`)
				return
			}
			if (attempt === 0) {
				current.setDiffFileIndex(resolved.fileIndex)
				const firstInFile = current.diffCommentAnchors.findIndex((anchor) => anchor.fileIndex === resolved.fileIndex)
				const anchorIndex = resolved.anchorIndex ?? firstInFile
				if (anchorIndex >= 0) current.setDiffCommentAnchorIndex(anchorIndex)
			}
			if (resolved.anchorIndex === null) current.scrollToDiffFile(resolved.fileIndex)
			else {
				// Show the whole thread when it fits, the anchor line always.
				if (resolved.threadBottom !== null) current.ensureDiffLineVisible(resolved.threadBottom)
				current.ensureDiffLineVisible(current.diffCommentAnchors[resolved.anchorIndex]!.renderLine)
			}
			timeoutRef.current = attempt + 1 < LAYOUT_RETRY_ATTEMPTS ? setTimeout(() => settle(attempt + 1), LAYOUT_RETRY_MS) : null
		}
		if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(() => settle(0), 0)
		// Runs when the target is parked and again as the diff and its threads arrive.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pending, selectedPullRequest?.url, diffFullView, stackedDiffFiles.length, threadsReady])
}
