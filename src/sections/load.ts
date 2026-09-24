import { Effect, Semaphore } from "effect"
import type { PullRequestItem } from "../domain.js"
import type { FilterExpr } from "../filter/parse.js"
import { compileSections, referencedTeams } from "./compile.js"
import type { SectionSort, SectionsConfig, SectionVarValue } from "./config.js"
import { mergeQueryResults } from "./merge.js"

// Loads every section of `sections.yaml`: resolve vars and team members,
// compile, then fetch each section. Every GitHub request (team members and
// each section's chunked searches) shares one semaphore, so at most
// SECTION_CONCURRENCY requests are in flight overall. Each section publishes its
// cached snapshot first and its fresh result when done, so the list fills in
// section by section. A failed section keeps its cached PRs and shows the error.

export const SECTION_CONCURRENCY = 4

export type SectionStatus = "loading" | "ready" | "error"

export interface SectionState {
	readonly id: string
	readonly title: string
	readonly key: string
	readonly status: SectionStatus
	readonly error: string | null
	/** Non-error hint shown dimmed under the header. */
	readonly note: string | null
	/** Member PR urls in fetch order; grouping re-sorts them. */
	readonly urls: readonly string[]
	readonly collapsed: boolean
	readonly where: FilterExpr | null
	readonly sort: SectionSort
	readonly exclusive: boolean
}

export interface SectionsSnapshot {
	readonly sections: readonly SectionState[]
	/** Union of every section's PRs, deduped by url. */
	readonly pullRequests: readonly PullRequestItem[]
}

export interface SectionLoadAdapter<E, R> {
	readonly viewer: Effect.Effect<string, E, R>
	readonly viewerTeams: Effect.Effect<readonly string[], unknown, R>
	readonly teamMembers: (org: string, team: string) => Effect.Effect<readonly string[], unknown, R>
	readonly search: (query: string, limit: number) => Effect.Effect<readonly PullRequestItem[], unknown, R>
	readonly readCached: (viewer: string, key: string) => Effect.Effect<readonly PullRequestItem[] | null, unknown, R>
	readonly writeCached: (viewer: string, key: string, pullRequests: readonly PullRequestItem[]) => Effect.Effect<void, never, R>
	readonly publish: (snapshot: SectionsSnapshot) => Effect.Effect<void, never, R>
}

const referencesVar = (config: SectionsConfig, name: string) =>
	config.sections.some((section) => [section.query, section.exclude, ...(section.any ?? [])].some((query) => query?.includes(`{${name}}`)))

const errorMessage = (error: unknown) => {
	if (error instanceof Error) return error.message
	if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message
	return String(error)
}

export const unionPullRequests = (groups: Iterable<readonly PullRequestItem[]>): readonly PullRequestItem[] => {
	const byUrl = new Map<string, PullRequestItem>()
	for (const group of groups) {
		for (const pullRequest of group) {
			if (!byUrl.has(pullRequest.url)) byUrl.set(pullRequest.url, pullRequest)
		}
	}
	return [...byUrl.values()]
}

export const loadSections = <E, R>(config: SectionsConfig, adapter: SectionLoadAdapter<E, R>): Effect.Effect<SectionsSnapshot, E, R> =>
	Effect.gen(function* () {
		const viewer = yield* adapter.viewer
		const vars: Record<string, SectionVarValue> = { ...config.vars }
		if (vars.my_teams === undefined && referencesVar(config, "my_teams")) {
			vars.my_teams = yield* adapter.viewerTeams.pipe(Effect.catch(() => Effect.succeed([] as readonly string[])))
		}

		const requests = yield* Semaphore.make(SECTION_CONCURRENCY)
		const limited = requests.withPermits(1)
		const teamMembers = new Map<string, readonly string[]>()
		yield* Effect.forEach(
			referencedTeams(config, { ...vars, me: viewer }),
			(team) => {
				const [org, slug] = team.split("/")
				if (!org || !slug) return Effect.void
				return limited(adapter.teamMembers(org, slug)).pipe(
					Effect.tap((members) => Effect.sync(() => teamMembers.set(team, members))),
					Effect.catch(() => Effect.void),
				)
			},
			{ concurrency: "unbounded", discard: true },
		)

		const compiled = compileSections(config, { viewer, vars, teamMembers })
		const states: SectionState[] = compiled.map((section) => ({
			id: section.id,
			title: section.title,
			key: section.key,
			status: section.error ? "error" : "loading",
			error: section.error,
			note: section.note,
			urls: [],
			collapsed: section.collapsed,
			where: section.where,
			sort: section.sort,
			exclusive: section.exclusive,
		}))
		const items = new Map<string, readonly PullRequestItem[]>()
		const setItems = (index: number, pullRequests: readonly PullRequestItem[]) => {
			items.set(states[index]!.id, pullRequests)
			states[index] = { ...states[index]!, urls: pullRequests.map((pullRequest) => pullRequest.url) }
		}
		const snapshot = (): SectionsSnapshot => ({ sections: [...states], pullRequests: unionPullRequests(states.map((state) => items.get(state.id) ?? [])) })
		const update = (index: number, patch: Partial<SectionState>, pullRequests?: readonly PullRequestItem[]) =>
			Effect.suspend(() => {
				if (pullRequests) setItems(index, pullRequests)
				states[index] = { ...states[index]!, ...patch }
				return adapter.publish(snapshot())
			})

		// Seed every section from its cached snapshot before the first publish,
		// so a refresh never flashes an empty list.
		yield* Effect.forEach(
			compiled,
			(section, index) =>
				Effect.gen(function* () {
					if (section.error) return
					const cached = yield* adapter.readCached(viewer, section.key).pipe(Effect.catch(() => Effect.succeed(null)))
					if (cached) setItems(index, cached)
				}),
			{ concurrency: SECTION_CONCURRENCY, discard: true },
		)
		yield* adapter.publish(snapshot())

		yield* Effect.forEach(
			compiled,
			(section, index) =>
				Effect.gen(function* () {
					if (section.error) return
					const result = yield* Effect.forEach(section.queries, (query) => limited(adapter.search(query, section.limit)), { concurrency: "unbounded" }).pipe(
						Effect.map((results) => mergeQueryResults(results, section.limit)),
						Effect.result,
					)
					if (result._tag === "Failure") {
						yield* update(index, { status: "error", error: errorMessage(result.failure) })
						return
					}
					yield* update(index, { status: "ready", error: null }, result.success)
					yield* adapter.writeCached(viewer, section.key, result.success)
				}),
			{ concurrency: "unbounded", discard: true },
		)

		return snapshot()
	})
