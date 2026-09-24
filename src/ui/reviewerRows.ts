import type { PullRequestItem, PullRequestReviewer, ReviewerState, ReviewStatus } from "../domain.js"
import { colors } from "./colors.js"
import { trimCell } from "./primitives.js"

export interface ReviewerSegment {
	readonly text: string
	readonly fg: string
	readonly bold?: boolean
}

export type ReviewerRow = readonly ReviewerSegment[]

/** At most this many rows; the rest collapse into "+N more". */
export const REVIEWER_ROWS_LIMIT = 2

const LABEL = "Reviewers"
const SEPARATOR = "  "

// Single-width glyphs only, so the row math stays exact.
export const reviewerGlyph: Record<ReviewerState, string> = {
	approved: "✓",
	changes: "!",
	commented: "◇",
	requested: "◐",
	pending: "◐",
	dismissed: "−",
}

const glyphColor = (state: ReviewerState) => {
	switch (state) {
		case "approved":
			return colors.status.approved
		case "changes":
			return colors.status.changes
		case "requested":
		case "pending":
			return colors.status.pending
		case "commented":
			return colors.text
		case "dismissed":
			return colors.muted
	}
}

const decisionText: Record<ReviewStatus, string | null> = {
	approved: "approved",
	changes: "changes requested",
	review: "review required",
	draft: null,
	none: null,
}

const reviewerName = (reviewer: PullRequestReviewer) => `${reviewer.login}${reviewer.codeOwner ? " (owner)" : ""}${reviewer.isViewer ? " (you)" : ""}`

const itemLength = (reviewer: PullRequestReviewer) => 2 + reviewerName(reviewer).length

/** Glyph + name, the name trimmed so the item takes at most `room` cells. */
const itemSegments = (reviewer: PullRequestReviewer, room: number): ReviewerSegment[] => [
	{ text: `${reviewerGlyph[reviewer.state]} `, fg: glyphColor(reviewer.state) },
	{ text: trimCell(reviewerName(reviewer), Math.max(1, room - 2)), fg: reviewer.isViewer ? colors.count : colors.text },
]

const moreText = (hidden: number) => `${SEPARATOR}+${hidden} more`

const summarySegments = (pullRequest: PullRequestItem): ReviewerSegment[] => {
	const reviewers = pullRequest.reviewers
	if (!reviewers) return []
	if (reviewers.requiredApprovals !== null && reviewers.requiredApprovals > 0) {
		const approved = reviewers.reviewers.filter((reviewer) => reviewer.state === "approved").length
		const fg = approved >= reviewers.requiredApprovals ? colors.status.approved : colors.status.pending
		return [
			{ text: " · ", fg: colors.muted },
			{ text: `${approved}/${reviewers.requiredApprovals} approvals`, fg },
		]
	}
	const decision = decisionText[pullRequest.reviewStatus]
	return decision ? [{ text: ` · ${decision}`, fg: colors.muted }] : []
}

const rowLength = (row: readonly ReviewerSegment[]) => row.reduce((total, segment) => total + segment.text.length, 0)

/** Trims trailing segments so the row never exceeds `width` cells. */
const fitRow = (row: readonly ReviewerSegment[], width: number): ReviewerSegment[] => {
	const fitted: ReviewerSegment[] = []
	let used = 0
	for (const segment of row) {
		if (used + segment.text.length <= width) {
			fitted.push(segment)
			used += segment.text.length
			continue
		}
		if (width - used > 0) fitted.push({ ...segment, text: trimCell(segment.text, width - used) })
		break
	}
	return fitted
}

/**
 * The "Reviewers" rows of the detail header: requested and past reviewers with
 * a state glyph, packed into at most two rows with "+N more" on overflow. Pure
 * so the header height math and the renderer agree on the row count. Empty
 * until the detail query has filled `reviewers` (old cache rows included).
 */
export const reviewerRows = (pullRequest: PullRequestItem, contentWidth: number): readonly ReviewerRow[] => {
	const reviewers = pullRequest.detailLoaded ? pullRequest.reviewers : undefined
	if (!reviewers) return []
	const width = Math.max(1, contentWidth)
	const heading = fitRow([{ text: LABEL, fg: colors.muted }, ...summarySegments(pullRequest)], width)
	const list = reviewers.reviewers
	if (list.length === 0) return [fitRow([...heading, { text: `${SEPARATOR}none requested`, fg: colors.muted }], width)]

	const rows: ReviewerSegment[][] = [[...heading]]
	// Continuation rows line up under the first reviewer when there is room.
	const indent = width - LABEL.length - SEPARATOR.length >= 20 ? " ".repeat(LABEL.length + SEPARATOR.length) : ""
	let index = 0
	while (index < list.length) {
		const reviewer = list[index]!
		const row = rows[rows.length - 1]!
		const used = rowLength(row)
		const lastRow = rows.length === REVIEWER_ROWS_LIMIT
		const remainingAfter = list.length - index - 1
		const reserve = lastRow && remainingAfter > 0 ? moreText(remainingAfter).length : 0
		const freshRow = rows.length > 1 && used === indent.length
		const gap = freshRow ? 0 : SEPARATOR.length
		if (used + gap + itemLength(reviewer) + reserve <= width) {
			if (gap > 0) row.push({ text: SEPARATOR, fg: colors.muted })
			row.push(...itemSegments(reviewer, itemLength(reviewer)))
			index++
			continue
		}
		if (!lastRow) {
			rows.push(indent ? [{ text: indent, fg: colors.muted }] : [])
			continue
		}
		// Every item placed on the last row left room for this "+N more"; a
		// fresh row whose first item is too wide gets that item trimmed.
		const room = width - used - reserve
		if (freshRow && room >= 6) {
			row.push(...itemSegments(reviewer, room))
			index++
		}
		if (index < list.length) row.push({ text: moreText(list.length - index), fg: colors.muted })
		break
	}
	return rows.map((row) => fitRow(row, width))
}
