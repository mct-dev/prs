import type { MutableRefObject } from "react"
import type { IssueItem, PullRequestComment, PullRequestItem } from "../domain.js"
import { errorMessage } from "../errors.js"
import { capRecord } from "../recordCap.js"
import { pullRequestDiffKey } from "../ui/diff.js"
import type { StoredCommentLoadState } from "../ui/comments/loadState.js"

// Cap of the in-memory comments cache. One entry per PR/issue ever opened;
// without a cap, day-long TUI sessions accumulate forever.
const COMMENTS_CACHE_CAP = 64

export interface UseCommentsLoaderInput {
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly readCommentsLoadState: () => Record<string, StoredCommentLoadState>
	readonly setPullRequestComments: (next: (prev: Record<string, readonly PullRequestComment[]>) => Record<string, readonly PullRequestComment[]>) => void
	readonly setPullRequestCommentsLoaded: (next: (prev: Record<string, StoredCommentLoadState>) => Record<string, StoredCommentLoadState>) => void
	readonly listPullRequestComments: (input: { repository: string; number: number }) => Promise<readonly PullRequestComment[]>
	readonly listIssueComments: (input: { repository: string; number: number }) => Promise<readonly PullRequestComment[]>
	readonly flashNotice: (msg: string) => void
}

export interface CommentsLoader {
	readonly loadPullRequestComments: (pullRequest: PullRequestItem, force?: boolean) => void
	readonly loadIssueComments: (issue: IssueItem, force?: boolean) => void
}

/**
 * Two parallel loaders (PR + issue comments). Both:
 *   - Skip if a load for this key already happened (unless `force`).
 *   - Mark the key "loading", call the GH service, store results.
 *   - Snapshot a refresh generation up front; ignore the response if the
 *     generation has moved on (a refresh wiped the cache mid-flight).
 *   - On error: retain an actionable error state and any cached data.
 */
export const useCommentsLoader = ({
	refreshGenerationRef,
	readCommentsLoadState,
	setPullRequestComments,
	setPullRequestCommentsLoaded,
	listPullRequestComments,
	listIssueComments,
	flashNotice,
}: UseCommentsLoaderInput): CommentsLoader => {
	const load = (key: string, fetch: () => Promise<readonly PullRequestComment[]>, force: boolean) => {
		const previousLoadState = readCommentsLoadState()[key]
		if (!force && previousLoadState) return
		const generation = refreshGenerationRef.current
		const cached = previousLoadState?.status === "ready" || previousLoadState?.cached === true
		setPullRequestCommentsLoaded((current) => capRecord({ ...current, [key]: { status: "loading", cached } }, COMMENTS_CACHE_CAP))
		void fetch()
			.then((items) => {
				if (generation !== refreshGenerationRef.current) return
				setPullRequestComments((current) => capRecord({ ...current, [key]: items }, COMMENTS_CACHE_CAP))
				setPullRequestCommentsLoaded((current) => capRecord({ ...current, [key]: { status: "ready" } }, COMMENTS_CACHE_CAP))
			})
			.catch((error) => {
				if (generation !== refreshGenerationRef.current) return
				const message = errorMessage(error)
				setPullRequestCommentsLoaded((current) => capRecord({ ...current, [key]: { status: "error", error: message, cached } }, COMMENTS_CACHE_CAP))
				flashNotice(message)
			})
	}

	return {
		loadPullRequestComments: (pullRequest, force = false) =>
			load(pullRequestDiffKey(pullRequest), () => listPullRequestComments({ repository: pullRequest.repository, number: pullRequest.number }), force),
		loadIssueComments: (issue, force = false) =>
			load(`issue:${issue.repository}#${issue.number}`, () => listIssueComments({ repository: issue.repository, number: issue.number }), force),
	}
}
