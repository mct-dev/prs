import type { PullRequestItem } from "../../src/domain.js"

export const makePullRequest = (overrides: Partial<PullRequestItem> = {}): PullRequestItem => {
	const number = overrides.number ?? 1
	const repository = overrides.repository ?? "my-org/web"
	return {
		repository,
		author: "alice",
		headRefOid: "head1",
		headRefName: "feature/thing",
		baseRefName: "main",
		defaultBranchName: "main",
		number,
		title: "Add a thing",
		body: "",
		labels: [],
		additions: 0,
		deletions: 0,
		changedFiles: 0,
		state: "open",
		reviewStatus: "none",
		checkStatus: "none",
		checkSummary: null,
		checks: [],
		autoMergeEnabled: false,
		detailLoaded: false,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		closedAt: null,
		url: `https://github.com/${repository}/pull/${number}`,
		...overrides,
	}
}
