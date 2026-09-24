import type { ScrollBoxRenderable } from "@opentui/core"
import { type MutableRefObject, useEffect, useRef } from "react"
import { registerHandoff } from "../../commands/handoffs.js"
import { nearestDiffAnchorForLocation, type StackedDiffCommentAnchor } from "../diff.js"

const DIFF_LAYOUT_RETRY_MS = 16
const DIFF_SCROLL_RESTORE_ATTEMPTS = 6
const DIFF_STICKY_HEADER_LINES = 2

interface PendingDiffLocationRestore {
	readonly anchor: StackedDiffCommentAnchor
	readonly screenOffset: number
}

export interface UseDiffLocationPreservationInput {
	readonly diffFullView: boolean
	readonly selectedDiffCommentAnchor: StackedDiffCommentAnchor | null
	readonly diffCommentAnchors: readonly StackedDiffCommentAnchor[]
	readonly diffWhitespaceMode: string // dependency that triggers restore re-run
	readonly diffScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly wideBodyHeight: number
	readonly suppressNextDiffCommentScrollRef: MutableRefObject<boolean>
	readonly setDiffCommentAnchorIndex: (next: number) => void
	readonly setDiffFileIndex: (next: number) => void
	readonly syncDiffScrollState: () => void
}

export interface UseDiffLocationPreservationResult {
	/**
	 * Snapshot the current selected anchor + viewport offset. After the diff
	 * re-renders (e.g. on view-mode toggle, wrap toggle, whitespace toggle),
	 * the hook restores scroll so the same anchor stays in the same screen
	 * row.
	 */
	readonly preserveCurrentDiffLocation: () => void
}

/**
 * Owns the "preserve scroll across diff re-render" protocol: callers
 * mark the current anchor as the restore target before mutating a diff
 * setting, and the hook's effect runs after the new render and walks
 * a layout-settle retry loop until the scrollbox can actually reach
 * the target position.
 */
export const useDiffLocationPreservation = ({
	diffFullView,
	selectedDiffCommentAnchor,
	diffCommentAnchors,
	diffWhitespaceMode,
	diffScrollRef,
	wideBodyHeight,
	suppressNextDiffCommentScrollRef,
	setDiffCommentAnchorIndex,
	setDiffFileIndex,
	syncDiffScrollState,
}: UseDiffLocationPreservationInput): UseDiffLocationPreservationResult => {
	const pendingDiffLocationRestoreRef = useRef<PendingDiffLocationRestore | null>(null)
	const diffLocationRestoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (diffLocationRestoreTimeoutRef.current !== null) clearTimeout(diffLocationRestoreTimeoutRef.current)
		},
		[],
	)

	useEffect(() => {
		const pending = pendingDiffLocationRestoreRef.current
		if (!pending || !diffFullView || diffCommentAnchors.length === 0) return
		pendingDiffLocationRestoreRef.current = null
		const nextAnchor = nearestDiffAnchorForLocation(diffCommentAnchors, pending.anchor)
		if (!nextAnchor) return
		if (diffLocationRestoreTimeoutRef.current !== null) clearTimeout(diffLocationRestoreTimeoutRef.current)
		suppressNextDiffCommentScrollRef.current = true
		setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
		setDiffFileIndex(nextAnchor.fileIndex)

		let attempts = 0
		const restoreScroll = () => {
			attempts++
			const scroll = diffScrollRef.current
			if (scroll) {
				const viewportHeight = Math.max(1, scroll.viewport.height)
				const maxScrollTop = Math.max(0, scroll.scrollHeight - viewportHeight)
				const targetTop = Math.max(0, nextAnchor.renderLine - pending.screenOffset)
				const nextTop = Math.min(maxScrollTop, targetTop)
				suppressNextDiffCommentScrollRef.current = true
				if (Math.floor(scroll.scrollTop) !== nextTop) {
					scroll.scrollTo({ x: 0, y: nextTop })
					syncDiffScrollState()
				}
				if (maxScrollTop >= targetTop && Math.floor(scroll.scrollTop) === targetTop) {
					suppressNextDiffCommentScrollRef.current = false
					diffLocationRestoreTimeoutRef.current = null
					return
				}
			}
			if (attempts < DIFF_SCROLL_RESTORE_ATTEMPTS) {
				diffLocationRestoreTimeoutRef.current = globalThis.setTimeout(restoreScroll, DIFF_LAYOUT_RETRY_MS)
			} else {
				suppressNextDiffCommentScrollRef.current = false
				diffLocationRestoreTimeoutRef.current = null
			}
		}
		diffLocationRestoreTimeoutRef.current = globalThis.setTimeout(restoreScroll, DIFF_LAYOUT_RETRY_MS)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [diffFullView, diffWhitespaceMode, diffCommentAnchors])

	const preserveCurrentDiffLocation = () => {
		if (diffFullView && selectedDiffCommentAnchor) {
			const scroll = diffScrollRef.current
			const maxScreenOffset = Math.max(DIFF_STICKY_HEADER_LINES, (scroll?.viewport.height ?? wideBodyHeight) - 2)
			const rawScreenOffset = scroll ? selectedDiffCommentAnchor.renderLine - Math.floor(scroll.scrollTop) : DIFF_STICKY_HEADER_LINES
			pendingDiffLocationRestoreRef.current = {
				anchor: selectedDiffCommentAnchor,
				screenOffset: Math.max(DIFF_STICKY_HEADER_LINES, Math.min(maxScreenOffset, rawScreenOffset)),
			}
		}
	}

	// Expose to command Effects: diff toggles inside `commands/builtins.ts`
	// invoke this handoff synchronously *before* the atom write that
	// triggers a re-render, so we capture the pre-mutation scrollTop and
	// anchor.renderLine here. Re-register on dependency change so the
	// closure reflects the live values.
	useEffect(() => registerHandoff("preserveDiffLocation", preserveCurrentDiffLocation), [diffFullView, selectedDiffCommentAnchor, diffScrollRef, wideBodyHeight])

	return { preserveCurrentDiffLocation }
}
