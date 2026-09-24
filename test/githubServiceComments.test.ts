import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { CommandError, CommandRunner, type CommandResult } from "../src/services/CommandRunner.ts"
import { GitHubService } from "../src/services/GitHubService.ts"
import { classifyGitHubRateLimit, isGitHubRateLimitError } from "../src/services/githubRateLimit.ts"

interface RecordedCall {
	readonly command: string
	readonly args: readonly string[]
}

const fakeCommandRunner = (response: string, recorder: RecordedCall[]) =>
	Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (command, args) => {
				recorder.push({ command, args: [...args] })
				const result: CommandResult = { stdout: response, stderr: "", exitCode: 0 }
				return Effect.succeed(result)
			},
			runSchema: <S extends Schema.Top>(schema: S, command: string, args: readonly string[]) => {
				recorder.push({ command, args: [...args] })
				return Effect.try({
					try: () => JSON.parse(response) as unknown,
					catch: (cause) => cause,
				}).pipe(Effect.flatMap((value) => Schema.decodeUnknownEffect(schema)(value))) as Effect.Effect<S["Type"], never, S["DecodingServices"]>
			},
		}),
	)

const baseIssueResponse = JSON.stringify({
	id: 9001,
	user: { login: "kit" },
	body: "Updated body",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-02T00:00:00Z",
	html_url: "https://github.com/owner/repo/issues/1#issuecomment-9001",
	url: "https://api.github.com/repos/owner/repo/issues/comments/9001",
})

const baseReviewResponse = JSON.stringify({
	id: 7777,
	node_id: "PRRC_abc",
	user: { login: "kit" },
	body: "Updated review body",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-02T00:00:00Z",
	path: "src/foo.ts",
	line: 42,
	original_line: 42,
	side: "RIGHT",
	in_reply_to_id: null,
	html_url: "https://github.com/owner/repo/pull/1#discussion_r7777",
	url: "https://api.github.com/repos/owner/repo/pulls/comments/7777",
})

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, layer: Layer.Layer<GitHubService>) =>
	Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)

const operationCall = (recorder: readonly RecordedCall[]) => {
	expect(recorder.filter((call) => call.args[0] === "api" && call.args[1] === "user")).toHaveLength(1)
	const call = recorder.find((call) => !(call.args[0] === "api" && call.args[1] === "user"))
	if (!call) throw new Error("Expected a GitHub operation after authentication")
	return call
}

const repositoryPullRequestListResponse = JSON.stringify({
	data: {
		repository: {
			pullRequests: {
				nodes: [
					{
						number: 42,
						title: "Keep startup queries cheap",
						isDraft: false,
						reviewDecision: null,
						autoMergeRequest: null,
						state: "OPEN",
						merged: false,
						createdAt: "2026-01-01T00:00:00Z",
						updatedAt: "2026-01-01T00:00:00Z",
						closedAt: null,
						url: "https://github.com/owner/repo/pull/42",
						author: { login: "kit" },
						headRefOid: "abc123",
						headRefName: "cheap-list-query",
						baseRefName: "main",
						repository: { nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } },
					},
				],
				pageInfo: { hasNextPage: false, endCursor: null },
			},
		},
	},
})

describe("GitHubService list queries", () => {
	test("shares concurrent authenticated-user lookups", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(JSON.stringify({ login: "kit" }), recorder)))
		const users = await runWith(
			GitHubService.use((github) => Effect.all([github.getAuthenticatedUser(), github.getAuthenticatedUser(), github.getAuthenticatedUser()], { concurrency: "unbounded" })),
			layer,
		)

		expect(users).toEqual(["kit", "kit", "kit"])
		expect(recorder.filter((call) => call.args[0] === "api" && call.args[1] === "user")).toHaveLength(1)
	})

	test("repository PR list query omits expensive status checks", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(repositoryPullRequestListResponse, recorder)))
		const page = await runWith(
			GitHubService.use((github) => github.listPullRequestPage({ kind: "pullRequest", mode: "all", repository: "owner/repo", cursor: null, pageSize: 1 })),
			layer,
		)

		expect(page.items).toHaveLength(1)
		expect(page.items[0]!.checkStatus).toBe("none")
		const call = operationCall(recorder)
		const queryArg = call.args.find((arg) => arg.startsWith("query=")) ?? ""
		expect(queryArg).not.toContain("statusCheckRollup")
		expect(queryArg).not.toContain("contexts(first: 100)")
		expect(call.args).toContain("first=1")
	})

	test("classifies GitHub rate limit errors", () => {
		expect(classifyGitHubRateLimit("graphql_rate_limit: API rate limit already exceeded")).toBe("graphql")
		expect(classifyGitHubRateLimit("You have exceeded a secondary rate limit")).toBe("secondary")
		expect(isGitHubRateLimitError({ detail: "API rate limit already exceeded for user ID 1." })).toBe(true)
		expect(isGitHubRateLimitError({ detail: "Repository not found" })).toBe(false)
	})

	test("loads large repository label sets for the label picker", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner("[]", recorder)))
		await runWith(
			GitHubService.use((github) => github.listRepoLabels("owner/repo")),
			layer,
		)

		expect(operationCall(recorder).args).toContain("1000")
	})
})

describe("GitHubService comment edit/delete", () => {
	test("editPullRequestIssueComment PATCHes the issue comments endpoint", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(baseIssueResponse, recorder)))
		const updated = await runWith(
			GitHubService.use((github) => github.editPullRequestIssueComment("owner/repo", "9001", "Updated body")),
			layer,
		)

		expect(updated._tag).toBe("comment")
		expect(updated.body).toBe("Updated body")
		expect(updated.id).toBe("9001")
		const call = operationCall(recorder)
		expect(call.command).toBe("gh")
		expect(call.args).toEqual(["api", "--method", "PATCH", "repos/owner/repo/issues/comments/9001", "-f", "body=Updated body"])
	})

	test("editReviewComment PATCHes the pulls comments endpoint", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(baseReviewResponse, recorder)))
		const updated = await runWith(
			GitHubService.use((github) => github.editReviewComment("owner/repo", "7777", "Updated review body")),
			layer,
		)

		expect(updated._tag).toBe("review-comment")
		expect(updated.body).toBe("Updated review body")
		expect(operationCall(recorder).args).toEqual(["api", "--method", "PATCH", "repos/owner/repo/pulls/comments/7777", "-f", "body=Updated review body"])
	})

	test("deletePullRequestIssueComment DELETEs the issue comments endpoint", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner("", recorder)))
		await runWith(
			GitHubService.use((github) => github.deletePullRequestIssueComment("owner/repo", "9001")),
			layer,
		)

		expect(operationCall(recorder).args).toEqual(["api", "--method", "DELETE", "repos/owner/repo/issues/comments/9001"])
	})

	test("deleteReviewComment DELETEs the pulls comments endpoint", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner("", recorder)))
		await runWith(
			GitHubService.use((github) => github.deleteReviewComment("owner/repo", "7777")),
			layer,
		)

		expect(operationCall(recorder).args).toEqual(["api", "--method", "DELETE", "repos/owner/repo/pulls/comments/7777"])
	})
})

const detailPullRequest = {
	...JSON.parse(repositoryPullRequestListResponse).data.repository.pullRequests.nodes[0],
	body: "Details body",
	additions: 3,
	deletions: 1,
	changedFiles: 2,
	labels: { nodes: [{ name: "bug", color: "d73a4a" }] },
	statusCheckRollup: null,
}

// The full detail query fails (as it can for tokens without `read:org`); the lite one succeeds.
const reviewersFailingRunner = (recorder: RecordedCall[], failure: string) =>
	Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: () => Effect.succeed({ stdout: "", stderr: "", exitCode: 0 } satisfies CommandResult),
			runSchema: <S extends Schema.Top>(schema: S, command: string, args: readonly string[]) => {
				if (args[1] === "graphql") recorder.push({ command, args: [...args] })
				const query = args.find((arg) => arg.startsWith("query=")) ?? ""
				if (args[1] !== "graphql") return Schema.decodeUnknownEffect(schema)({ login: "kit" }) as Effect.Effect<S["Type"], never, S["DecodingServices"]>
				if (query.includes("reviewRequests")) {
					return Effect.fail(new CommandError({ command, args: [...args], detail: failure, cause: failure })) as unknown as Effect.Effect<S["Type"], never, S["DecodingServices"]>
				}
				return Schema.decodeUnknownEffect(schema)({ data: { repository: { pullRequest: detailPullRequest } } }) as Effect.Effect<S["Type"], never, S["DecodingServices"]>
			},
		}),
	)

describe("GitHubService pull request details", () => {
	test("still loads details when the reviewers part of the query fails", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(
			Layer.provide(reviewersFailingRunner(recorder, "GraphQL: Resource not accessible by integration (repository.pullRequest.reviewRequests)")),
		)
		const pullRequest = await runWith(
			GitHubService.use((github) => github.getPullRequestDetails("owner/repo", 42)),
			layer,
		)

		expect(pullRequest.body).toBe("Details body")
		expect(pullRequest.labels.map((label) => label.name)).toEqual(["bug"])
		expect(pullRequest.reviewers).toBeUndefined()
		const queries = recorder.map((call) => call.args.find((arg) => arg.startsWith("query=")) ?? "")
		expect(queries).toHaveLength(2)
		expect(queries[0]).toContain("reviewRequests")
		expect(queries[1]).not.toContain("reviewRequests")
		expect(queries[1]).toContain("statusCheckRollup")
	})

	test("does not retry a rate-limited detail query", async () => {
		const recorder: RecordedCall[] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(reviewersFailingRunner(recorder, "API rate limit exceeded for user")))
		const result = await Effect.runPromise(
			GitHubService.use((github) => github.getPullRequestDetails("owner/repo", 42)).pipe(Effect.provide(layer), Effect.result) as Effect.Effect<{ readonly _tag: string }>,
		)

		expect(result._tag).toBe("Failure")
		expect(recorder).toHaveLength(1)
	})
})
