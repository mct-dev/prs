import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { IssueItem, PullRequestComment, PullRequestItem, PullRequestReviewComment } from "../domain.js"

export interface MockFixturePullRequest extends PullRequestItem {
	readonly diff: string
	readonly comments: readonly PullRequestComment[]
	readonly reviewComments: readonly PullRequestReviewComment[]
}

export interface MockFixtureIssue extends IssueItem {
	readonly comments?: readonly PullRequestComment[]
}

export interface MockFixtureSnapshot {
	readonly repository: string
	readonly generatedAt: string
	readonly pullRequests: readonly MockFixturePullRequest[]
	readonly issues: readonly MockFixtureIssue[]
}

const fixturePath = () => resolve(process.cwd(), process.env.GHUI_MOCK_FIXTURE_PATH ?? ".ghui/opencode-fixtures.json")

const asDate = (value: unknown) => (typeof value === "string" ? new Date(value) : value instanceof Date ? value : new Date())

const reviveComment = (comment: PullRequestComment): PullRequestComment =>
	({ ...comment, createdAt: comment.createdAt === null ? null : asDate(comment.createdAt) }) as PullRequestComment

export const loadMockFixtureSnapshot = (): MockFixtureSnapshot | null => {
	const path = fixturePath()
	if (!existsSync(path)) return null
	const parsed = JSON.parse(readFileSync(path, "utf8")) as MockFixtureSnapshot
	return {
		...parsed,
		pullRequests: parsed.pullRequests.map((pullRequest) => ({
			...pullRequest,
			baseRefName: pullRequest.baseRefName ?? "main",
			defaultBranchName: pullRequest.defaultBranchName ?? pullRequest.baseRefName ?? "main",
			createdAt: asDate(pullRequest.createdAt),
			closedAt: pullRequest.closedAt === null ? null : asDate(pullRequest.closedAt),
			comments: pullRequest.comments.map(reviveComment),
			reviewComments: pullRequest.reviewComments.map((comment) => ({ ...comment, createdAt: comment.createdAt === null ? null : asDate(comment.createdAt) })),
		})),
		issues: parsed.issues.map((issue) => ({
			...issue,
			createdAt: asDate(issue.createdAt),
			updatedAt: asDate(issue.updatedAt),
			...(issue.comments ? { comments: issue.comments.map(reviveComment) } : {}),
		})),
	}
}
