import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { PullRequestItem } from "../src/domain.js"
import type { SectionsConfig } from "../src/sections/config.js"
import { AUTHOR_CHUNK_SIZE } from "../src/sections/compile.js"
import { loadSections, SECTION_CONCURRENCY, type SectionLoadAdapter, type SectionsSnapshot } from "../src/sections/load.js"
import { makePullRequest } from "./fixtures/pullRequest.js"

const pr = (number: number, author = "bob") => makePullRequest({ number, author, updatedAt: new Date(Date.UTC(2026, 2, number)) })

interface FakeOptions {
	readonly results?: Record<string, readonly PullRequestItem[]>
	readonly failing?: readonly string[]
	readonly cached?: Record<string, readonly PullRequestItem[]>
	readonly teams?: Record<string, readonly string[]>
	readonly viewerTeams?: readonly string[]
	/** Delay every search so concurrent requests overlap. */
	readonly searchDelayMs?: number
}

const fakeAdapter = (options: FakeOptions = {}) => {
	const searches: string[] = []
	const published: SectionsSnapshot[] = []
	const written: string[] = []
	let viewerTeamCalls = 0
	let inFlight = 0
	let maxInFlight = 0
	const adapter: SectionLoadAdapter<never, never> = {
		viewer: Effect.succeed("alice"),
		viewerTeams: Effect.sync(() => {
			viewerTeamCalls++
			return options.viewerTeams ?? ["my-org/backend"]
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
				const result = Effect.succeed(key ? options.results![key]! : [])
				if (options.searchDelayMs === undefined) return result
				return Effect.acquireUseRelease(
					Effect.sync(() => {
						inFlight++
						maxInFlight = Math.max(maxInFlight, inFlight)
					}),
					() => Effect.andThen(Effect.sleep(options.searchDelayMs!), result),
					() => Effect.sync(() => void inFlight--),
				)
			}),
		readCached: (_viewer, key) => Effect.succeed(Object.entries(options.cached ?? {}).find(([id]) => key.startsWith(`${id}:`))?.[1] ?? null),
		writeCached: (_viewer, key) => Effect.sync(() => void written.push(key)),
		publish: (snapshot) => Effect.sync(() => void published.push(snapshot)),
	}
	return { adapter, searches, published, written, viewerTeamCalls: () => viewerTeamCalls, maxInFlight: () => maxInFlight }
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
		expect(fake.searches).toEqual(["is:pr is:open archived:false sort:updated-desc author:bob author:carol"])
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

	test("a viewer with no teams gets an empty team section with a note, not an error", async () => {
		const fake = fakeAdapter({ viewerTeams: [] })
		const snapshot = await Effect.runPromise(loadSections(config([{ id: "team", title: "Team", query: "team-authors:{my_teams}" }]), fake.adapter))
		expect(fake.searches).toHaveLength(0)
		expect(snapshot.sections[0]).toMatchObject({ status: "ready", error: null, note: "no teams found; set vars.my_teams", urls: [] })
	})

	test("at most SECTION_CONCURRENCY searches run at once across all sections and chunks", async () => {
		const members = Array.from({ length: AUTHOR_CHUNK_SIZE * 3 }, (_, index) => `dev${index}`)
		const sections = Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, title: `S${index}`, query: `team-authors:my-org/big label:l${index}` }))
		const fake = fakeAdapter({ teams: { "my-org/big": members }, searchDelayMs: 5 })
		await Effect.runPromise(loadSections(config(sections), fake.adapter))
		expect(fake.searches).toHaveLength(18)
		expect(fake.maxInFlight()).toBe(SECTION_CONCURRENCY)
	})
})
