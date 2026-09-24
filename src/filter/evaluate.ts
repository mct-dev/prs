import type { PullRequestItem } from "../domain.js"
import { filterByScore, pullRequestFilterScore } from "../ui/filter/scoring.js"
import { type FilterExpr, type FilterField, type FilterPredicate, parseFilterQuery } from "./parse.js"

// Three-valued evaluation: a predicate on data that has not loaded yet is
// "unknown", and unknown never hides a PR. `not unknown` stays unknown.
export type Tri = boolean | "unknown"

export type RiskLevel = "low" | "medium" | "high"
export type BriefStatus = "none" | "stale" | "running" | "done"

/** Injected lookups for data owned by other subsystems (agent review). */
export interface FilterLookups {
	readonly risk: (pullRequest: PullRequestItem) => RiskLevel | "unknown"
	readonly brief: (pullRequest: PullRequestItem) => BriefStatus | "unknown"
	/** Whether the PR is in section `id` (lowercased). Unknown until sections have loaded, or for an unknown id. */
	readonly section: (pullRequest: PullRequestItem, id: string) => Tri
}

export interface FilterContext {
	readonly now: Date
	readonly viewer: string | null
	readonly lookups: FilterLookups
}

export const unknownFilterLookups: FilterLookups = {
	risk: () => "unknown",
	brief: () => "unknown",
	section: () => "unknown",
}

export const makeFilterContext = (options: Partial<FilterContext> = {}): FilterContext => ({
	now: options.now ?? new Date(),
	viewer: options.viewer ?? null,
	lookups: options.lookups ?? unknownFilterLookups,
})

const HOUR = 60 * 60 * 1000
const durationUnits: Record<string, number> = { m: 60 * 1000, h: HOUR, d: 24 * HOUR, w: 7 * 24 * HOUR }

/** `2h`, `3d`, `1w` (and `30m`). A bare number means days. */
export const parseDuration = (value: string): number | null => {
	const match = /^(\d+(?:\.\d+)?)([mhdw]?)$/i.exec(value.trim())
	if (!match) return null
	return Number(match[1]) * durationUnits[(match[2] || "d").toLowerCase()]!
}

const parseCount = (value: string): number | null => {
	const match = /^(\d+)(k?)$/i.exec(value.trim())
	if (!match) return null
	return Number(match[1]) * (match[2] ? 1000 : 1)
}

const compare = (actual: number, op: FilterPredicate["op"], expected: number): boolean => {
	switch (op) {
		case ":":
			return actual === expected
		case ">":
			return actual > expected
		case "<":
			return actual < expected
		case ">=":
			return actual >= expected
		case "<=":
			return actual <= expected
	}
}

const parseBoolean = (value: string): boolean | null => {
	const normalized = value.toLowerCase()
	if (["true", "yes", "1"].includes(normalized)) return true
	if (["false", "no", "0"].includes(normalized)) return false
	return null
}

const riskRank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 }
const parseRisk = (value: string): RiskLevel | null => {
	const normalized = value.toLowerCase()
	if (normalized === "med") return "medium"
	return normalized === "low" || normalized === "medium" || normalized === "high" ? normalized : null
}

const ciAliases: Record<string, PullRequestItem["checkStatus"]> = {
	pass: "passing",
	passing: "passing",
	success: "passing",
	fail: "failing",
	failing: "failing",
	failure: "failing",
	pending: "pending",
	none: "none",
}

const reviewAliases: Record<string, PullRequestItem["reviewStatus"]> = {
	approved: "approved",
	changes: "changes",
	changes_requested: "changes",
	required: "review",
	review: "review",
	none: "none",
	draft: "draft",
}

const briefValues: ReadonlySet<string> = new Set<BriefStatus>(["none", "stale", "running", "done"])

/** Whether `value` is one `field` can ever match (used to warn about typos like `ci:passs`). */
export const isValidFilterValue = (field: FilterField, value: string): boolean => {
	const normalized = value.toLowerCase()
	switch (field) {
		case "draft":
		case "me.reviewed":
		case "me.reviewed_since_push":
			return parseBoolean(normalized) !== null
		case "size":
		case "files":
			return parseCount(normalized) !== null
		case "age":
		case "idle":
			return parseDuration(normalized) !== null
		case "ci":
			return normalized in ciAliases
		case "review":
			return normalized in reviewAliases
		case "risk":
			return parseRisk(normalized) !== null
		case "brief":
			return briefValues.has(normalized)
		default:
			return normalized.length > 0
	}
}

// Glob → RegExp for `file:` (supports `**`, `*`, `?`). Kept for when file lists load.
export const globToRegExp = (glob: string): RegExp => {
	let source = ""
	for (let index = 0; index < glob.length; index++) {
		const char = glob[index]!
		if (char === "*" && glob[index + 1] === "*") {
			source += ".*"
			index++
			if (glob[index + 1] === "/") index++
		} else if (char === "*") source += "[^/]*"
		else if (char === "?") source += "[^/]"
		else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
	}
	return new RegExp(`(^|/)${source}($|/)`, "i")
}

const evaluatePositive = (pullRequest: PullRequestItem, predicate: FilterPredicate, context: FilterContext): Tri => {
	const value = predicate.value.toLowerCase()
	const numeric = (actual: number, parse: (value: string) => number | null = parseCount): Tri => {
		const expected = parse(value)
		return expected === null ? "unknown" : compare(actual, predicate.op, expected)
	}
	switch (predicate.field) {
		case "author": {
			// GraphQL reports bot logins without the `app/` prefix search uses.
			const bot = (login: string) => login.replace(/^app\//, "").replace(/\[bot\]$/, "")
			const expected = value.replace(/^@/, "")
			const target = expected === "me" && context.viewer ? context.viewer.toLowerCase() : expected
			return bot(pullRequest.author.toLowerCase()) === bot(target)
		}
		case "repo": {
			const repository = pullRequest.repository.toLowerCase()
			return value.includes("/") ? repository === value : repository.includes(value)
		}
		case "org":
			return pullRequest.repository.toLowerCase().split("/")[0] === value.replace(/^@/, "")
		case "label":
			if (!pullRequest.detailLoaded) return "unknown"
			return pullRequest.labels.some((label) => label.name.toLowerCase() === value)
		case "draft": {
			const expected = parseBoolean(value)
			return expected === null ? "unknown" : (pullRequest.reviewStatus === "draft") === expected
		}
		case "size":
			return pullRequest.detailLoaded ? numeric(pullRequest.additions + pullRequest.deletions) : "unknown"
		case "files":
			return pullRequest.detailLoaded ? numeric(pullRequest.changedFiles) : "unknown"
		case "file":
			// The changed-file list is not part of PR summaries or details yet.
			return "unknown"
		case "age":
			return numeric(context.now.getTime() - pullRequest.createdAt.getTime(), parseDuration)
		case "idle":
			return numeric(context.now.getTime() - pullRequest.updatedAt.getTime(), parseDuration)
		case "ci": {
			if (!pullRequest.detailLoaded) return "unknown"
			const expected = ciAliases[value]
			return expected === undefined ? "unknown" : pullRequest.checkStatus === expected
		}
		case "review": {
			const expected = reviewAliases[value]
			return expected === undefined ? "unknown" : pullRequest.reviewStatus === expected
		}
		case "risk": {
			const actual = context.lookups.risk(pullRequest)
			const expected = parseRisk(value)
			if (actual === "unknown" || expected === null) return "unknown"
			return compare(riskRank[actual], predicate.op, riskRank[expected])
		}
		case "brief": {
			const actual = context.lookups.brief(pullRequest)
			return actual === "unknown" ? "unknown" : actual === value
		}
		case "section":
			return context.lookups.section(pullRequest, value)
		case "me.reviewed": {
			const expected = parseBoolean(value)
			if (pullRequest.viewerLatestReviewOid === undefined || expected === null) return "unknown"
			return (pullRequest.viewerLatestReviewOid !== null) === expected
		}
		case "me.reviewed_since_push": {
			const expected = parseBoolean(value)
			if (pullRequest.viewerLatestReviewOid === undefined || expected === null) return "unknown"
			return (pullRequest.viewerLatestReviewOid === pullRequest.headRefOid) === expected
		}
	}
}

const not = (value: Tri): Tri => (value === "unknown" ? "unknown" : !value)

export const evaluatePredicate = (pullRequest: PullRequestItem, predicate: FilterPredicate, context: FilterContext): Tri => {
	const result = evaluatePositive(pullRequest, predicate, context)
	return predicate.negated ? not(result) : result
}

const textMatches = (pullRequest: PullRequestItem, text: string): boolean => pullRequestFilterScore(pullRequest, text) !== null

/** Kleene three-valued logic over a `where:` expression. */
export const evaluateExpression = (pullRequest: PullRequestItem, expression: FilterExpr, context: FilterContext): Tri => {
	switch (expression._tag) {
		case "Predicate":
			return evaluatePredicate(pullRequest, expression, context)
		case "Text":
			return textMatches(pullRequest, expression.text)
		case "Not":
			return not(evaluateExpression(pullRequest, expression.item, context))
		case "And": {
			let result: Tri = true
			for (const item of expression.items) {
				const value = evaluateExpression(pullRequest, item, context)
				if (value === false) return false
				if (value === "unknown") result = "unknown"
			}
			return result
		}
		case "Or": {
			let result: Tri = false
			for (const item of expression.items) {
				const value = evaluateExpression(pullRequest, item, context)
				if (value === true) return true
				if (value === "unknown") result = "unknown"
			}
			return result
		}
	}
}

/** Only a definite `false` hides a PR. */
export const passes = (value: Tri) => value !== false

/**
 * The `/` filter: predicates AND together (unknown passes), then the free-text
 * remainder is ranked with the existing substring scorer.
 */
export const filterPullRequests = (pullRequests: readonly PullRequestItem[], query: string, context: FilterContext): readonly PullRequestItem[] => {
	const { predicates, text } = parseFilterQuery(query)
	const matching =
		predicates.length === 0 ? pullRequests : pullRequests.filter((pullRequest) => predicates.every((predicate) => passes(evaluatePredicate(pullRequest, predicate, context))))
	return filterByScore(matching, text, pullRequestFilterScore, (pullRequest) => pullRequest.updatedAt.getTime())
}
