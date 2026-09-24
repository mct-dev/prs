import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { CommandRunner, type CommandResult } from "../src/services/CommandRunner.ts"
import { GitHubService } from "../src/services/GitHubService.ts"

const fakeCommandRunner = (respond: (args: readonly string[]) => unknown, calls: string[][]) =>
	Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (_command, args) => {
				calls.push([...args])
				const result: CommandResult = { stdout: JSON.stringify(respond(args)), stderr: "", exitCode: 0 }
				return Effect.succeed(result)
			},
			runSchema: <S extends Schema.Top>(schema: S, _command: string, args: readonly string[]) =>
				Effect.suspend(() => {
					calls.push([...args])
					return Schema.decodeUnknownEffect(schema)(respond(args))
				}) as Effect.Effect<S["Type"], never, S["DecodingServices"]>,
		}),
	)

const run = <A>(effect: Effect.Effect<A, unknown, GitHubService>, layer: Layer.Layer<GitHubService>) => Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)

const node = (number: number, viewerLatestReview: unknown = null) => ({
	number,
	title: `PR ${number}`,
	isDraft: false,
	reviewDecision: null,
	autoMergeRequest: null,
	state: "OPEN",
	merged: false,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
	closedAt: null,
	url: `https://github.com/my-org/web/pull/${number}`,
	author: { login: "alice" },
	headRefOid: `sha${number}`,
	headRefName: "feature",
	baseRefName: "main",
	viewerLatestReview,
	repository: { nameWithOwner: "my-org/web", defaultBranchRef: { name: "main" } },
})

describe("GitHubService sections methods", () => {
	test("searchPullRequests passes the raw query and drains pages up to the limit", async () => {
		const calls: string[][] = []
		const layer = GitHubService.layerNoDeps.pipe(
			Layer.provide(
				fakeCommandRunner((args) => {
					const after = args.find((arg) => arg.startsWith("after="))
					return after
						? { data: { search: { nodes: [node(3)], pageInfo: { hasNextPage: true, endCursor: "c2" } } } }
						: {
								data: {
									search: {
										nodes: [node(1, { state: "APPROVED", commit: { oid: "old" } }), node(2, { state: "PENDING", commit: { oid: "x" } })],
										pageInfo: { hasNextPage: true, endCursor: "c1" },
									},
								},
							}
				}, calls),
			),
		)
		const items = await run(
			Effect.gen(function* () {
				return yield* (yield* GitHubService).searchPullRequests("is:pr is:open review-requested:alice", 3)
			}),
			layer,
		)
		expect(items.map((item) => item.number)).toEqual([1, 2, 3])
		expect(items[0]!.viewerLatestReviewOid).toBe("old")
		expect("viewerLatestReviewOid" in items[1]!).toBe(false)
		expect(items[2]!.viewerLatestReviewOid).toBeNull()
		expect(calls).toHaveLength(2)
		expect(calls[0]).toContain("searchQuery=is:pr is:open review-requested:alice")
		expect(calls[1]).toContain("after=c1")
		expect(calls[1]).toContain("first=1")
	})

	test("listTeamMembers flattens pages and caches per team", async () => {
		const calls: string[][] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(() => [[{ login: "alice" }, { login: "bob" }], [{ login: "carol" }]], calls)))
		const result = await run(
			Effect.gen(function* () {
				const github = yield* GitHubService
				const first = yield* github.listTeamMembers("my-org", "backend")
				const second = yield* github.listTeamMembers("my-org", "backend")
				return { first, second }
			}),
			layer,
		)
		expect(result.first).toEqual(["alice", "bob", "carol"])
		expect(result.second).toEqual(result.first)
		expect(calls).toEqual([["api", "--paginate", "--slurp", "orgs/my-org/teams/backend/members"]])
	})

	test("listViewerTeams returns org/slug", async () => {
		const calls: string[][] = []
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(() => [[{ slug: "backend", organization: { login: "my-org" } }]], calls)))
		const teams = await run(
			Effect.gen(function* () {
				return yield* (yield* GitHubService).listViewerTeams()
			}),
			layer,
		)
		expect(teams).toEqual(["my-org/backend"])
	})

	test("listViewerTeamsDetailed carries names and member counts, sharing one request", async () => {
		const calls: string[][] = []
		const response = [
			[
				{ slug: "backend", name: "Backend", members_count: 12, organization: { login: "my-org" } },
				{ slug: "everyone", organization: { login: "my-org" } },
			],
		]
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(() => response, calls)))
		const result = await run(
			Effect.gen(function* () {
				const github = yield* GitHubService
				return { detailed: yield* github.listViewerTeamsDetailed(), slugs: yield* github.listViewerTeams() }
			}),
			layer,
		)
		expect(result.detailed).toEqual([
			{ slug: "my-org/backend", name: "Backend", members: 12 },
			{ slug: "my-org/everyone", name: "everyone", members: null },
		])
		expect(result.slugs).toEqual(["my-org/backend", "my-org/everyone"])
		expect(calls).toHaveLength(1)
	})
})
