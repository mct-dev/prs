import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { PullRequestItem } from "../src/domain.js"
import type { SectionsConfig } from "../src/sections/config.js"
import { loadSections, type SectionLoadAdapter, type SectionsSnapshot } from "../src/sections/load.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

const pr = (number: number, author = "bob") => makePullRequest({ number, author, updatedAt: new Date(Date.UTC(2026, 2, number)) })

interface FakeOptions {
	readonly results?: Record<string, readonly PullRequestItem[]>
	readonly failing?: readonly string[]
	readonly cached?: Record<string, readonly PullRequestItem[]>
	readonly teams?: Record<string, readonly string[]>
}

const fakeAdapter = (options: FakeOptions = {}) => {
	const searches: string[] = []
	const published: SectionsSnapshot[] = []
	const written: string[] = []
	let viewerTeamCalls = 0
	const adapter: SectionLoadAdapter<never, never> = {
		viewer: Effect.succeed("alice"),
		viewerTeams: Effect.sync(() => {
			viewerTeamCalls++
			return ["my-org/backend"]
		}),
		teamMembers: (org, team) => {
			const members = options.teams?.[`${org}/${team}`]
			return members ? Effect.succeed(members) : Effect.fail(new Error("not found"))
		},
		search: (query) =>
			Effect.suspend(() => {
				searches.push(query)
				const key = Object.keys(options.results ?? {}).find((fragment) => query.includes(fragment))
				if (options.failing?.some((fragment) => query.includes(fragment))) return Effect.fail(new Error("rate limited"))
				return Effect.succeed(key ? options.results![key]! : [])
			}),
		readCached: (_viewer, key) => Effect.succeed(Object.entries(options.cached ?? {}).find(([id]) => key.startsWith(`${id}:`))?.[1] ?? null),
		writeCached: (_viewer, key) => Effect.sync(() => void written.push(key)),
		publish: (snapshot) => Effect.sync(() => void published.push(snapshot)),
	}
	return { adapter, searches, published, written, viewerTeamCalls: () => viewerTeamCalls }
}

const config = (sections: SectionsConfig["sections"], vars?: SectionsConfig["vars"]): SectionsConfig => ({ ...(vars ? { vars } : {}), sections })

describe("loadSections", () => {
	test("fetches every section, publishes progress, and caches results", async () => {
		const fake = fakeAdapter({ results: { "review-requested:alice": [pr(1), pr(2)], "author:alice": [pr(3, "alice")] } })
		const snapshot = await Effect.runPromise(
			loadSections(
				config([
					{ id: "needs-me", title: "Needs me", query: "review-requested:{me}" },
					{ id: "mine", title: "Mine", query: "author:{me}" },
				]),
				fake.adapter,
			),
		)
		expect(snapshot.sections.map((section) => [section.id, section.status, section.urls.length])).toEqual([
			["needs-me", "ready", 2],
			["mine", "ready", 1],
		])
		expect(snapshot.pullRequests).toHaveLength(3)
		expect(fake.published[0]!.sections.every((section) => section.status === "loading")).toBe(true)
		expect(fake.published.length).toBe(3)
		expect(fake.written).toHaveLength(2)
		expect(fake.viewerTeamCalls()).toBe(0)
	})

	test("a failed section keeps its cached PRs and reports the error", async () => {
		const fake = fakeAdapter({ failing: ["author:alice"], cached: { mine: [pr(9, "alice")] } })
		const snapshot = await Effect.runPromise(loadSections(config([{ id: "mine", title: "Mine", query: "author:{me}" }]), fake.adapter))
		expect(snapshot.sections[0]).toMatchObject({ status: "error", error: "rate limited" })
		expect(snapshot.sections[0]!.urls).toEqual([pr(9).url])
		expect(fake.published[0]!.pullRequests.map((item) => item.number)).toEqual([9])
		expect(fake.written).toHaveLength(0)
	})

	test("fills {my_teams} from the viewer's teams and expands team members", async () => {
		const fake = fakeAdapter({ teams: { "my-org/backend": ["bob", "carol"] }, results: { "author:bob": [pr(4)] } })
		const snapshot = await Effect.runPromise(loadSections(config([{ id: "team", title: "Team", query: "team-authors:{my_teams}" }]), fake.adapter))
		expect(fake.viewerTeamCalls()).toBe(1)
		expect(fake.searches).toEqual(["is:pr is:open archived:false author:bob author:carol"])
		expect(snapshot.sections[0]!.status).toBe("ready")
	})

	test("an unloadable team becomes a section error without a search", async () => {
		const fake = fakeAdapter()
		const snapshot = await Effect.runPromise(
			loadSections(config([{ id: "team", title: "Team", query: "team-authors:{my_teams}" }], { my_teams: ["my-org/unknown"] }), fake.adapter),
		)
		expect(fake.viewerTeamCalls()).toBe(0)
		expect(fake.searches).toHaveLength(0)
		expect(snapshot.sections[0]).toMatchObject({ status: "error", error: "team my-org/unknown could not be loaded" })
	})
})
