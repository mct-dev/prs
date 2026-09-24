import type { IssueItem, PullRequestItem } from "../domain.js"
import { errorMessage } from "../errors.js"
import type { PullRequestView } from "../pullRequestViews.js"
import { parseIssueReferenceUrl } from "../ui/inlineSegments.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"

export interface UseLinkNavigationInput {
	readonly issues: readonly IssueItem[]
	readonly allIssues: readonly IssueItem[]
	readonly pullRequests: readonly PullRequestItem[]
	readonly selectedRepository: string | null
	readonly setActiveWorkspaceSurface: (next: WorkspaceSurface) => void
	readonly setSelectedIssueIndex: (next: number) => void
	readonly setDetailFullView: (next: boolean) => void
	readonly setFilterQuery: (next: string) => void
	readonly setFilterDraft: (next: string) => void
	readonly setFilterMode: (next: boolean) => void
	readonly selectPullRequestByUrl: (url: string) => void
	readonly switchViewTo: (view: PullRequestView) => void
	readonly openUrl: (url: string) => Promise<unknown>
	readonly flashNotice: (msg: string) => void
}

export interface LinkNavigation {
	readonly navigateIssueReference: (repository: string, number: number) => boolean
	readonly openInlineLink: (url: string) => void
}

/**
 * Inline-link navigation for `#123` references and GitHub URLs.
 *
 * Tries (in order): the visible issue list, the unfiltered issue list
 * (clearing any active filter), the loaded PR list, and finally
 * `switchViewTo` for cross-repo references. Falls through to opening
 * the URL externally if no in-app target is found.
 */
export const useLinkNavigation = ({
	issues,
	allIssues,
	pullRequests,
	selectedRepository,
	setActiveWorkspaceSurface,
	setSelectedIssueIndex,
	setDetailFullView,
	setFilterQuery,
	setFilterDraft,
	setFilterMode,
	selectPullRequestByUrl,
	switchViewTo,
	openUrl,
	flashNotice,
}: UseLinkNavigationInput): LinkNavigation => {
	const navigateIssueReference = (repository: string, number: number): boolean => {
		const issueIndex = issues.findIndex((issue) => issue.repository === repository && issue.number === number)
		if (issueIndex >= 0) {
			setActiveWorkspaceSurface("issues")
			setSelectedIssueIndex(issueIndex)
			setDetailFullView(false)
			flashNotice(`Opened ${repository}#${number}`)
			return true
		}
		const unfilteredIssueIndex = allIssues.findIndex((issue) => issue.repository === repository && issue.number === number)
		if (unfilteredIssueIndex >= 0) {
			setFilterQuery("")
			setFilterDraft("")
			setFilterMode(false)
			setActiveWorkspaceSurface("issues")
			setSelectedIssueIndex(unfilteredIssueIndex)
			setDetailFullView(false)
			flashNotice(`Opened ${repository}#${number}`)
			return true
		}
		const pullRequest = pullRequests.find((item) => item.repository === repository && item.number === number)
		if (pullRequest) {
			setActiveWorkspaceSurface("pullRequests")
			selectPullRequestByUrl(pullRequest.url)
			setDetailFullView(false)
			flashNotice(`Opened ${repository}#${number}`)
			return true
		}
		if (selectedRepository !== repository) {
			switchViewTo({ _tag: "Repository", repository })
			setActiveWorkspaceSurface("issues")
			setSelectedIssueIndex(0)
			flashNotice(`Opened ${repository}; #${number} will appear if it is loaded`)
			return true
		}
		return false
	}

	const openInlineLink = (url: string) => {
		const issueReference = parseIssueReferenceUrl(url)
		const targetUrl = issueReference ? `https://github.com/${issueReference.repository}/issues/${issueReference.number}` : url
		if (issueReference && navigateIssueReference(issueReference.repository, issueReference.number)) return
		void openUrl(targetUrl)
			.then(() => flashNotice(`Opened ${targetUrl}`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	return { navigateIssueReference, openInlineLink }
}
