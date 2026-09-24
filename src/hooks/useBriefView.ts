import { useAtom, useAtomValue } from "@effect/atom-react"
import { useCallback } from "react"
import type { PullRequestItem } from "../domain.js"
import type { BriefStatus, ReviewEntry } from "../review/briefStatus.js"
import type { BriefViewCtx } from "../keymap/briefView.js"
import { selectedBriefStatusAtom } from "../ui/review/atoms.js"
import { briefFocusIndexAtom, briefFullViewAtom, briefScrollTopAtom, selectedReviewEntryAtom } from "../ui/review/briefViewAtoms.js"
import { type BriefViewRow, briefViewRows, focusRowSpan, scrollToKeepVisible } from "../ui/review/briefViewRows.js"

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)))

// Chrome above the brief body: header row + subline row + divider row.
export const BRIEF_PANE_CHROME_ROWS = 3

export interface BriefViewModel {
	readonly ctx: BriefViewCtx
	readonly briefFullView: boolean
	readonly status: BriefStatus
	readonly entry: ReviewEntry | null
	readonly rows: readonly BriefViewRow[]
	readonly focusIndex: number
	readonly scrollTop: number
	// Click a focus area to select it; click it again to open the diff there.
	readonly clickFocus: (index: number) => void
}

/**
 * Owns the full brief view's cursor + scroll. Rows are computed here (not in
 * the pane) so j/k can keep the focused area inside the viewport exactly.
 */
export const useBriefView = ({
	selectedPullRequest,
	halfPage,
	contentWidth,
	height,
	runCommandById,
}: {
	readonly selectedPullRequest: PullRequestItem | null
	readonly halfPage: number
	readonly contentWidth: number
	readonly height: number
	readonly runCommandById: (id: string) => void
}): BriefViewModel => {
	const briefFullView = useAtomValue(briefFullViewAtom)
	const [focusIndex, setFocusIndex] = useAtom(briefFocusIndexAtom)
	const [rawScrollTop, setScrollTop] = useAtom(briefScrollTopAtom)
	const status = useAtomValue(selectedBriefStatusAtom)
	const entry = useAtomValue(selectedReviewEntryAtom)

	const rows = briefFullView && selectedPullRequest ? briefViewRows({ status, entry, headRefOid: selectedPullRequest.headRefOid, width: contentWidth, now: new Date() }) : []
	const bodyHeight = Math.max(1, height - BRIEF_PANE_CHROME_ROWS)
	const maxScroll = Math.max(0, rows.length - bodyHeight)
	const scrollTop = clamp(rawScrollTop, maxScroll)
	const focusCount = status._tag === "done" ? status.brief.focus_areas.length : 0

	const scrollBy = useCallback((delta: number) => setScrollTop(clamp(scrollTop + delta, maxScroll)), [scrollTop, maxScroll, setScrollTop])

	const focusAt = useCallback(
		(index: number) => {
			setFocusIndex(index)
			const span = focusRowSpan(rows, index)
			if (span) setScrollTop(scrollToKeepVisible(scrollTop, bodyHeight, span[0], span[1]))
		},
		[rows, scrollTop, bodyHeight, setFocusIndex, setScrollTop],
	)

	// With focus areas, j/k walks them; past either end it falls back to line
	// scrolling so the rows around the list stay reachable.
	const moveFocus = useCallback(
		(delta: number) => {
			if (focusCount === 0) return scrollBy(delta)
			const current = clamp(focusIndex, focusCount - 1)
			const next = clamp(current + delta, focusCount - 1)
			if (next === current) return scrollBy(delta)
			focusAt(next)
		},
		[focusCount, focusIndex, focusAt, scrollBy],
	)

	const toBoundary = useCallback(
		(boundary: "first" | "last") => {
			setScrollTop(boundary === "first" ? 0 : maxScroll)
			setFocusIndex(boundary === "first" ? 0 : Math.max(0, focusCount - 1))
		},
		[maxScroll, focusCount, setScrollTop, setFocusIndex],
	)

	const clickFocus = useCallback(
		(index: number) => {
			if (index === focusIndex) runCommandById("brief.open-focus")
			else focusAt(index)
		},
		[focusIndex, focusAt, runCommandById],
	)

	const ctx: BriefViewCtx = {
		halfPage,
		close: () => runCommandById("brief.close"),
		moveFocus,
		scrollBy,
		toBoundary,
		openFocus: () => runCommandById("brief.open-focus"),
		openLog: () => runCommandById("brief.open-log"),
		openInBrowser: () => runCommandById("pull.open-browser"),
		cancel: () => runCommandById("pull.agent-review-cancel"),
		runReview: () => runCommandById("pull.agent-review"),
		runReviewWithPreset: () => runCommandById("pull.agent-review-preset"),
	}

	return { ctx, briefFullView, status, entry, rows, focusIndex: clamp(focusIndex, focusCount - 1), scrollTop, clickFocus }
}
