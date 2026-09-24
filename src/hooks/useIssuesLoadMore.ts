import { useAtom, useAtomSet } from "@effect/atom-react"
import type { MutableRefObject } from "react"
import { config } from "../config.js"
import { useItemLoadMore } from "./useItemLoadMore.js"
import { type IssueView, issueViewToListInput } from "../issueViews.js"
import { itemQueueCacheViewer } from "../item/queue.js"
import { nextIssueLoadAfterPage } from "../issueCache.js"
import type { IssueLoad } from "../issueLoad.js"
import { pullRequestPageSize } from "../services/runtime.js"
import { listIssuePageAtom, loadingMoreIssueKeyAtom, writeIssueQueueAtom } from "../ui/issues/atoms.js"

export interface UseIssuesLoadMoreInput {
	readonly activeIssueView: IssueView
	readonly currentIssueCacheKey: string
	readonly issueLoad: IssueLoad | null
	readonly hasMoreIssues: boolean
	readonly issueFetchInFlight: boolean
	readonly username: string | null
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly flashNotice: (message: string) => void
	readonly setIssueQueueLoadCache: (next: (prev: Partial<Record<string, IssueLoad>>) => Partial<Record<string, IssueLoad>>) => void
}

export interface UseIssuesLoadMoreResult {
	readonly loadMoreIssues: () => boolean
	readonly isLoadingMoreIssues: boolean
	readonly resetLoadingMoreIssues: () => void
}

/** Typed Issue adapter for the shared Item load-more state machine. */
export const useIssuesLoadMore = ({
	activeIssueView,
	currentIssueCacheKey,
	issueLoad,
	hasMoreIssues,
	issueFetchInFlight,
	username,
	refreshGenerationRef,
	flashNotice,
	setIssueQueueLoadCache,
}: UseIssuesLoadMoreInput): UseIssuesLoadMoreResult => {
	const loadIssuePage = useAtomSet(listIssuePageAtom, { mode: "promise" })
	const writeIssueQueue = useAtomSet(writeIssueQueueAtom, { mode: "promise" })
	const [loadingMoreKey, setLoadingMoreKey] = useAtom(loadingMoreIssueKeyAtom)
	const { loadMore, isLoadingMore, resetLoadingMore } = useItemLoadMore({
		cacheKey: currentIssueCacheKey,
		load: issueLoad,
		hasMore: hasMoreIssues,
		fetchInFlight: issueFetchInFlight,
		itemLimit: config.prFetchLimit,
		pageSize: pullRequestPageSize,
		refreshGenerationRef,
		loadingMoreKey,
		setLoadingMoreKey,
		fetchPage: (cursor, pageSize) => loadIssuePage(issueViewToListInput(activeIssueView, cursor, pageSize)),
		mergePage: (current, page) => nextIssueLoadAfterPage(current, page, config.prFetchLimit),
		setLoadCache: setIssueQueueLoadCache,
		persistLoad: (load) => {
			const viewer = itemQueueCacheViewer(activeIssueView, username)
			if (viewer) return writeIssueQueue({ viewer, load })
		},
		flashNotice,
		timeoutMessage: "Load more issues timed out after 15s",
	})

	return { loadMoreIssues: loadMore, isLoadingMoreIssues: isLoadingMore, resetLoadingMoreIssues: resetLoadingMore }
}
