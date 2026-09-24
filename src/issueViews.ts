import { type IssueListMode, type IssueQuery, issueQueryToListInput, type ItemListInput, itemQueryCacheKey } from "./item.js"

// Mirrors `PullRequestView`. `Repository` means "all issues in this repo";
// `Queue` carries the people qualifier (authored/assigned/mentioned). The
// "all" mode is reserved for the Repository view, so Queue's mode excludes it.
export type IssueView =
	| { readonly _tag: "Repository"; readonly repository: string }
	| { readonly _tag: "Queue"; readonly mode: Exclude<IssueListMode, "all">; readonly repository: string | null }

export const initialIssueView = (repository: string | null = null): IssueView =>
	repository ? { _tag: "Repository", repository } : { _tag: "Queue", mode: "authored", repository: null }

export const issueViewMode = (view: IssueView): IssueListMode => (view._tag === "Repository" ? "all" : view.mode)
export const issueViewRepository = (view: IssueView) => view.repository
export const issueViewToQuery = (view: IssueView): IssueQuery => ({ mode: issueViewMode(view), repository: issueViewRepository(view), textFilter: "" })

export const issueViewToListInput = (view: IssueView, cursor: string | null, pageSize: number): ItemListInput<"issue"> =>
	issueQueryToListInput(issueViewToQuery(view), cursor, pageSize)

// Stable cache key shared with the service-seam input. PR keys start with
// `pullRequest:`; issue keys start with `issue:`. Migration `003` relies on
// that prefix split when pruning legacy snapshots.
export const issueViewCacheKey = (view: IssueView) => itemQueryCacheKey("issue", issueViewToQuery(view))

export const issueViewEquals = (left: IssueView, right: IssueView) =>
	left._tag === right._tag && issueViewMode(left) === issueViewMode(right) && left.repository === right.repository
