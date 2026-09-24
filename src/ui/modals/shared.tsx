import type { PullRequestLabel, PullRequestMergeInfo, PullRequestMergeMethod, PullRequestReviewComment, PullRequestReviewEvent, RepositoryMergeMethods } from "../../domain.js"
import { allowedMergeMethodList } from "../../domain.js"
import { colors } from "../colors.js"
import { commentDisplayRows, type CommentDisplayLine } from "../comments.js"
import type { DiffFilePatch } from "../diff.js"
import { TokenLine, type Token } from "../primitives.js"
import { shortRepoName } from "../pullRequests.js"

export const filterLabels = (labels: readonly PullRequestLabel[], query: string): readonly PullRequestLabel[] => {
	const normalized = query.trim().toLowerCase()
	if (normalized.length === 0) return labels
	return labels.filter((label) => label.name.toLowerCase().includes(normalized))
}

export interface ChangedFileSearchResult {
	readonly file: DiffFilePatch
	readonly index: number
	readonly matchIndexes: readonly number[]
}

interface PathSegment {
	readonly text: string
	readonly lower: string
	readonly start: number
	readonly index: number
	readonly isBasename: boolean
}

interface FileTokenMatch {
	readonly score: number
	readonly indexes: readonly number[]
	readonly start: number
}

const PATH_WORD_BOUNDARIES = new Set(["-", "_", "."])

const pathSearchTokens = (query: string) =>
	query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter((token) => token.length > 0)

const pathSegments = (path: string): readonly PathSegment[] => {
	const parts = path.split("/")
	let start = 0
	return parts.map((part, index) => {
		const segment = {
			text: part,
			lower: part.toLowerCase(),
			start,
			index,
			isBasename: index === parts.length - 1,
		}
		start += part.length + 1
		return segment
	})
}

const isPathWordBoundary = (segment: string, index: number) => index === 0 || PATH_WORD_BOUNDARIES.has(segment[index - 1] ?? "")

const fuzzyIndexesFrom = (text: string, token: string, start: number): readonly number[] | null => {
	const indexes: number[] = []
	let tokenIndex = 0
	for (let index = start; index < text.length && tokenIndex < token.length; index++) {
		if (text[index] === token[tokenIndex]) {
			indexes.push(index)
			tokenIndex++
		}
	}
	return tokenIndex === token.length ? indexes : null
}

const scoreSegmentMatch = (segment: PathSegment, token: string, localIndexes: readonly number[], contiguous: boolean): number => {
	const localStart = localIndexes[0] ?? 0
	const localEnd = localIndexes[localIndexes.length - 1] ?? localStart
	const span = localEnd - localStart + 1
	let score = 1000

	if (segment.lower === token) score += 700
	else if (contiguous && localStart === 0) score += 460
	else if (contiguous && isPathWordBoundary(segment.lower, localStart)) score += 380
	else if (contiguous) score += 280
	else score += 120

	if (segment.isBasename) score += 320
	if (isPathWordBoundary(segment.lower, localStart)) score += 80
	if (localStart === 0) score += 60
	score += Math.min(segment.index, 8) * 18
	score += Math.max(0, 120 - span * 4)
	score += Math.max(0, 40 - localStart * 2)

	if (segment.index === 0 && segment.lower === "packages" && segment.lower !== token) score -= 360

	return score
}

const tokenMatchInSegment = (segment: PathSegment, token: string): FileTokenMatch | null => {
	let best: FileTokenMatch | null = null
	const addCandidate = (localIndexes: readonly number[], contiguous: boolean) => {
		const score = scoreSegmentMatch(segment, token, localIndexes, contiguous)
		const start = segment.start + (localIndexes[0] ?? 0)
		const indexes = localIndexes.map((index) => segment.start + index)
		if (!best || score > best.score || (score === best.score && start < best.start)) {
			best = { score, indexes, start }
		}
	}

	let substringStart = segment.lower.indexOf(token)
	while (substringStart >= 0) {
		addCandidate(
			Array.from({ length: token.length }, (_, index) => substringStart + index),
			true,
		)
		substringStart = segment.lower.indexOf(token, substringStart + 1)
	}

	for (let index = 0; index < segment.lower.length; index++) {
		if (segment.lower[index] !== token[0]) continue
		const indexes = fuzzyIndexesFrom(segment.lower, token, index)
		if (indexes) addCandidate(indexes, false)
	}

	return best
}

const tokenMatchInPath = (segments: readonly PathSegment[], token: string): FileTokenMatch | null => {
	let best: FileTokenMatch | null = null
	for (const segment of segments) {
		const match = tokenMatchInSegment(segment, token)
		if (!match) continue
		if (!best || match.score > best.score || (match.score === best.score && match.start < best.start)) {
			best = match
		}
	}
	return best
}

const fuzzyPathMatch = (path: string, query: string): { readonly score: number; readonly matchIndexes: readonly number[] } | null => {
	const tokens = pathSearchTokens(query)
	if (tokens.length === 0) return { score: 0, matchIndexes: [] }

	const segments = pathSegments(path)
	const matchIndexes = new Set<number>()
	let score = 0
	let previousStart = -1

	for (const token of tokens) {
		const match = tokenMatchInPath(segments, token)
		if (!match) return null
		score += match.score
		score += previousStart < 0 || match.start >= previousStart ? 80 : -80
		previousStart = match.start
		for (const index of match.indexes) matchIndexes.add(index)
	}

	return { score, matchIndexes: [...matchIndexes].sort((left, right) => left - right) }
}

export const filterChangedFiles = (files: readonly DiffFilePatch[], query: string): readonly ChangedFileSearchResult[] => {
	const hasQuery = pathSearchTokens(query).length > 0
	const results: Array<ChangedFileSearchResult & { readonly score: number }> = []
	for (const [index, file] of files.entries()) {
		const match = fuzzyPathMatch(file.name, query)
		if (match) results.push({ file, index, matchIndexes: match.matchIndexes, score: match.score })
	}
	if (hasQuery) {
		results.sort((left, right) => {
			return right.score - left.score || left.index - right.index
		})
	}
	return results
}

export interface SubmitReviewOption {
	readonly event: PullRequestReviewEvent
	readonly title: string
	readonly description: string
}

export const submitReviewOptions: readonly SubmitReviewOption[] = [
	{ event: "COMMENT", title: "Comment", description: "Submit a general review without changing status" },
	{ event: "APPROVE", title: "Approve", description: "Approve this pull request" },
	{ event: "REQUEST_CHANGES", title: "Request changes", description: "Block merge until follow-up changes are made" },
]

const submitReviewEventColors = {
	COMMENT: colors.status.review,
	APPROVE: colors.status.passing,
	REQUEST_CHANGES: colors.status.failing,
} satisfies Record<PullRequestReviewEvent, string>

export const submitReviewEventColor = (event: PullRequestReviewEvent): string => submitReviewEventColors[event]

export const mergeUnavailableReason = (info: PullRequestMergeInfo | null): string => {
	if (!info) return "Loading merge status from GitHub."
	if (info.state !== "open") return "This pull request is not open."
	// Check the real blockers first; draft alone is recoverable via mark-ready, so
	// it's only the message of last resort.
	if (info.mergeable === "conflicting") return "This branch has merge conflicts."
	if (info.checkStatus === "failing") return "Required checks are failing."
	if (info.checkStatus === "pending") return "Required checks are still running."
	if (info.reviewStatus === "changes") return "Reviewer has requested changes."
	if (info.reviewStatus === "review") return "Awaiting required review."
	if (info.isDraft) return "Draft pull requests cannot be merged."
	return "No merge actions are currently available."
}

export const MethodStripLine = ({ allowed, selected }: { allowed: RepositoryMergeMethods; selected: PullRequestMergeMethod }) => {
	const tokens: Token[] = allowedMergeMethodList(allowed).map((method) =>
		method === selected ? { text: ` ${method} `, fg: colors.selectedText, bg: colors.selectedBg, bold: true } : { text: ` ${method} `, fg: colors.muted },
	)
	return <TokenLine tokens={tokens} separator="" />
}

const CHECK_STATUS_FG = {
	failing: colors.status.failing,
	pending: colors.status.pending,
	passing: colors.status.passing,
	none: colors.muted,
} as const satisfies Record<PullRequestMergeInfo["checkStatus"], string>

export const buildStatusBadges = (info: PullRequestMergeInfo | null, repo: string | null): readonly Token[] => {
	if (info) {
		const tokens: Token[] = [{ text: shortRepoName(info.repository), fg: colors.muted }]
		if (info.mergeable === "conflicting") tokens.push({ text: "conflicting", fg: colors.error })
		if (info.isDraft) tokens.push({ text: "draft", fg: colors.status.draft })
		if (info.reviewStatus === "changes") tokens.push({ text: "changes requested", fg: colors.status.changes })
		if (info.reviewStatus === "review") tokens.push({ text: "review pending", fg: colors.status.review })
		if (info.reviewStatus === "approved" && !info.isDraft) tokens.push({ text: "approved", fg: colors.status.approved })
		if (info.checkStatus !== "none") tokens.push({ text: `checks ${info.checkSummary ?? info.checkStatus}`, fg: CHECK_STATUS_FG[info.checkStatus] })
		return tokens
	}
	return repo ? [{ text: shortRepoName(repo), fg: colors.muted }] : []
}

export const commentThreadRows = (comments: readonly PullRequestReviewComment[], width: number): readonly CommentDisplayLine[] =>
	comments.flatMap((comment) => commentDisplayRows({ item: comment, width }))
