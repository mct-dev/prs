import type { PullRequestItem, PullRequestReviewComment } from "../../domain.js"
import {
	type DiffCommentAnchor,
	diffCommentAnchorLabel,
	diffCommentLineLabel,
	diffCommentLocationKey,
	diffCommentSideLabel,
	pullRequestDiffKey,
	type StackedDiffCommentAnchor,
} from "../diff.js"

export interface DiffCommentRangeSelection {
	readonly start: StackedDiffCommentAnchor
	readonly end: StackedDiffCommentAnchor
}

export const diffCommentThreadMapKey = (diffKey: string, location: Pick<PullRequestReviewComment, "path" | "side" | "line">) => `${diffKey}:${diffCommentLocationKey(location)}`

export const diffCommentThreadKey = (pullRequest: PullRequestItem, comment: Pick<PullRequestReviewComment, "path" | "side" | "line">) =>
	diffCommentThreadMapKey(pullRequestDiffKey(pullRequest), comment)

export const groupDiffCommentThreads = (pullRequest: PullRequestItem, comments: readonly PullRequestReviewComment[]): Record<string, PullRequestReviewComment[]> => {
	const threads: Record<string, PullRequestReviewComment[]> = {}
	for (const comment of comments) {
		const key = diffCommentThreadKey(pullRequest, comment)
		const thread = threads[key]
		if (thread) thread.push(comment)
		else threads[key] = [comment]
	}
	return threads
}

export const isLocalDiffComment = (comment: PullRequestReviewComment) => comment.id.startsWith("local:")

// Two anchors target the same diff cell if they share path + side. Line is
// allowed to differ because a range *spans* lines on a single side.
export const sameDiffCommentTarget = (left: DiffCommentAnchor, right: DiffCommentAnchor) => left.path === right.path && left.side === right.side

export const diffCommentRangeSelection = (start: StackedDiffCommentAnchor | null, end: StackedDiffCommentAnchor | null): DiffCommentRangeSelection | null => {
	if (!start || !end || !sameDiffCommentTarget(start, end)) return null
	return start.line <= end.line ? { start, end } : { start: end, end: start }
}

export const diffCommentRangeContains = (range: DiffCommentRangeSelection, anchor: StackedDiffCommentAnchor) =>
	sameDiffCommentTarget(range.start, anchor) && anchor.line >= range.start.line && anchor.line <= range.end.line

export const diffCommentRangeLabel = (range: DiffCommentRangeSelection) =>
	range.start.line === range.end.line
		? diffCommentAnchorLabel(range.end)
		: `${diffCommentSideLabel(range.end)} ${diffCommentLineLabel(range.start)}-${diffCommentLineLabel(range.end)}`
