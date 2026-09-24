import type { PullRequestItem } from "../domain.js"
import { evaluateExpression, type FilterContext, passes, type RiskLevel } from "../filter/evaluate.js"
import type { FilterExpr } from "../filter/parse.js"
import type { SectionSort } from "./config.js"

export interface SectionGrouping {
	readonly id: string
	readonly where: FilterExpr | null
	readonly sort: SectionSort
	readonly exclusive: boolean
}

export interface SectionGroup {
	readonly id: string
	readonly pullRequests: readonly PullRequestItem[]
}

/** Merge the results of a section's queries by PR url, newest first, trimmed to `limit`. */
export const mergeQueryResults = (results: readonly (readonly PullRequestItem[])[], limit: number): readonly PullRequestItem[] => {
	const byUrl = new Map<string, PullRequestItem>()
	for (const result of results) {
		for (const pullRequest of result) {
			if (!byUrl.has(pullRequest.url)) byUrl.set(pullRequest.url, pullRequest)
		}
	}
	return [...byUrl.values()].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()).slice(0, limit)
}

const riskRank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 }

// Missing values sort last in either direction.
const sortKey = (pullRequest: PullRequestItem, field: string, context: FilterContext): number | null => {
	switch (field) {
		case "updated":
			return pullRequest.updatedAt.getTime()
		case "age":
			return context.now.getTime() - pullRequest.createdAt.getTime()
		case "size":
			return pullRequest.detailLoaded ? pullRequest.additions + pullRequest.deletions : null
		case "risk": {
			const risk = context.lookups.risk(pullRequest)
			return risk === "unknown" ? null : riskRank[risk]
		}
		default:
			return null
	}
}

/** `field` sorts ascending, `-field` descending. Ties break newest-updated first. */
export const sortSectionPullRequests = (pullRequests: readonly PullRequestItem[], sort: SectionSort, context: FilterContext): readonly PullRequestItem[] => {
	const descending = sort.startsWith("-")
	const field = descending ? sort.slice(1) : sort
	return pullRequests
		.map((pullRequest) => ({ pullRequest, key: sortKey(pullRequest, field, context) }))
		.sort((left, right) => {
			if (left.key !== right.key) {
				if (left.key === null) return 1
				if (right.key === null) return -1
				return descending ? right.key - left.key : left.key - right.key
			}
			return right.pullRequest.updatedAt.getTime() - left.pullRequest.updatedAt.getTime()
		})
		.map(({ pullRequest }) => pullRequest)
}

/**
 * Assign PRs to sections in config order. First match wins: an exclusive
 * section skips PRs already claimed and claims the ones it shows. A section
 * with `exclusive: false` shows every match and claims nothing. `where:` hides
 * a PR only when it evaluates to a definite false.
 */
export const assignSections = (
	sections: readonly SectionGrouping[],
	membership: ReadonlyMap<string, readonly string[]>,
	pullRequestsByUrl: ReadonlyMap<string, PullRequestItem>,
	context: FilterContext,
): readonly SectionGroup[] => {
	const claimed = new Set<string>()
	return sections.map((section) => {
		const members = (membership.get(section.id) ?? []).flatMap((url) => {
			const pullRequest = pullRequestsByUrl.get(url)
			return pullRequest ? [pullRequest] : []
		})
		const matching = members.filter((pullRequest) => {
			if (section.where && !passes(evaluateExpression(pullRequest, section.where, context))) return false
			return !section.exclusive || !claimed.has(pullRequest.url)
		})
		if (section.exclusive) for (const pullRequest of matching) claimed.add(pullRequest.url)
		return { id: section.id, pullRequests: sortSectionPullRequests(matching, section.sort, context) }
	})
}

/** url → ids of the sections it was assigned to, in config order. */
export const sectionMembershipByUrl = (groups: readonly SectionGroup[]): ReadonlyMap<string, readonly string[]> => {
	const byUrl = new Map<string, string[]>()
	for (const group of groups) {
		for (const pullRequest of group.pullRequests) {
			const ids = byUrl.get(pullRequest.url)
			if (ids) ids.push(group.id)
			else byUrl.set(pullRequest.url, [group.id])
		}
	}
	return byUrl
}

export interface SectionLookupState {
	readonly id: string
	readonly status: "loading" | "ready" | "error"
}

/**
 * The `section:<id>` lookup. Unknown (never hides) while no section has
 * loaded, for an id that is not configured, or while that section is still
 * loading; otherwise whether the PR was assigned to the section.
 */
export const sectionLookup =
	(states: readonly SectionLookupState[], membership: ReadonlyMap<string, readonly string[]> | null) =>
	(pullRequest: PullRequestItem, id: string): boolean | "unknown" => {
		if (membership === null) return "unknown"
		const state = states.find((candidate) => candidate.id.toLowerCase() === id)
		if (!state) return "unknown"
		const ids = membership.get(pullRequest.url) ?? []
		if (ids.some((candidate) => candidate.toLowerCase() === id)) return true
		return state.status === "loading" ? "unknown" : false
	}
