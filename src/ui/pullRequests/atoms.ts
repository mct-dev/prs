import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { config } from "../../config.js"
import type { LoadStatus, PullRequestItem, PullRequestLabel, PullRequestMergeAction, PullRequestMergeMethod, RepositoryDetails, RepositoryMergeMethods } from "../../domain.js"
import { devLog } from "../../devLog.js"
import { itemQueryCacheKeyHasRepository, type ItemListInput, searchQualifier } from "../../item.js"
import { resolveItemLoad, trimItemLoadCache } from "../../item/load.js"
import { loadItemQueue } from "../../item/queue.js"
import { retryItemQueueFirstPage } from "../../item/retry.js"
import { freshPullRequestLoad, mergePullRequestDetail } from "../../pullRequestCache.js"
export { nextLoadAfterPage } from "../../pullRequestCache.js"
import type { PullRequestLoad } from "../../pullRequestLoad.js"
import { activePullRequestViews, type PullRequestView, SECTIONS_VIEW_CACHE_KEY, sectionsView, viewCacheKey, viewRepository, viewToListInput } from "../../pullRequestViews.js"
import { type FilterLookups, filterPullRequests, makeFilterContext, unknownFilterLookups } from "../../filter/evaluate.js"
import { parseFilterQuery } from "../../filter/parse.js"
import { briefFilterValue, briefRisk, briefStatusFor } from "../../review/briefStatus.js"
import { loadSectionsConfig } from "../../sections/config.js"
import { loadSections, type SectionState, type SectionsSnapshot, type SectionStatus } from "../../sections/load.js"
import type { SectionCursor } from "../../sections/cursor.js"
import { assignSections, sectionLookup, sectionMembershipByUrl } from "../../sections/merge.js"
import { CacheService } from "../../services/CacheService.js"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime, homePullRequestView, pullRequestPageSize } from "../../services/runtime.js"
import { effectiveFilterQueryAtom } from "../filter/atoms.js"
import { agentReviewIndexAtom } from "../review/indexAtom.js"
import { initialRetryProgress, RetryProgress } from "../FooterHints.js"
import { selectedIndexAtom } from "../listSelection/atoms.js"
import { groupBy } from "../pullRequests.js"

const MAX_REPOSITORY_CACHE_ENTRIES = 8

// === UI cache atoms ===
export const labelCacheAtom = Atom.make<Record<string, readonly PullRequestLabel[]>>({}).pipe(Atom.keepAlive)
export const repoMergeMethodsCacheAtom = Atom.make<Record<string, RepositoryMergeMethods>>({}).pipe(Atom.keepAlive)
export const lastUsedMergeMethodAtom = Atom.make<Record<string, PullRequestMergeMethod>>({}).pipe(Atom.keepAlive)
export const pullRequestOverridesAtom = Atom.make<Record<string, PullRequestItem>>({}).pipe(Atom.keepAlive)
export const recentlyCompletedPullRequestsAtom = Atom.make<Record<string, PullRequestItem>>({}).pipe(Atom.keepAlive)
export const repositoryDetailsCacheAtom = Atom.make<Record<string, RepositoryDetails>>({}).pipe(Atom.keepAlive)

// === Atom-key helpers (shared with diff atoms) ===
export const pullRequestRevisionAtomKey = (pullRequest: PullRequestItem) => `${pullRequest.repository}\u0000${pullRequest.number}\u0000${pullRequest.headRefOid}`
export const parsePullRequestRevisionAtomKey = (key: string, label: string): { repository: string; number: number } => {
	const [repository, number] = key.split("\u0000")
	if (!repository || !number) throw new Error(`Invalid pull request ${label} key: ${key}`)
	return { repository, number: Number.parseInt(number, 10) }
}
export const pullRequestDetailKey = (pullRequest: PullRequestItem) => `${pullRequest.url}:${pullRequest.headRefOid}`

// === Helpers used by atom bodies and by load-more handlers ===
// `nextLoadAfterPage` is re-exported from pullRequestCache.js above so callers
// don't need to know where it lives.

const trimQueueLoadCache = (cache: Partial<Record<string, PullRequestLoad>>) => {
	return trimItemLoadCache(cache, itemQueryCacheKeyHasRepository, MAX_REPOSITORY_CACHE_ENTRIES)
}

// === View / queue state atoms ===
export const retryProgressAtom = Atom.make<RetryProgress>(initialRetryProgress).pipe(Atom.keepAlive)
export const activeViewAtom = Atom.make<PullRequestView>(homePullRequestView).pipe(Atom.keepAlive)
export const queueLoadCacheAtom = Atom.make<Partial<Record<string, PullRequestLoad>>>({}).pipe(Atom.keepAlive)
export const queueSelectionAtom = Atom.make<Partial<Record<string, number>>>({}).pipe(Atom.keepAlive)

// === Sections view state ===
// Per-section status and membership, published by the sections loader as each
// section resolves. The PRs themselves live in `queueLoadCacheAtom` under the
// sections view key, so detail hydration updates them like any other queue.
export const sectionStatesAtom = Atom.make<readonly SectionState[]>([]).pipe(Atom.keepAlive)
/** Set when `sections.yaml` could not be used; the defaults render with this message. */
export const sectionsConfigErrorAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
/** Collapse toggles by section id, overriding `collapsed:` from config. */
export const collapsedSectionsAtom = Atom.make<Partial<Record<string, boolean>>>({}).pipe(Atom.keepAlive)
/** Section `[` / `]` / `z` act on; see `sections/cursor.ts`. */
export const sectionCursorAtom = Atom.make<SectionCursor | null>(null).pipe(Atom.keepAlive)

// Keep hydrated details when a fresh search summary for the same head arrives.
const keepHydratedDetail = (existing: readonly PullRequestItem[], fresh: readonly PullRequestItem[]) => {
	const detailed = new Map(existing.filter((pullRequest) => pullRequest.detailLoaded).map((pullRequest) => [pullRequest.url, pullRequest]))
	if (detailed.size === 0) return fresh
	return fresh.map((pullRequest) => {
		const detail = detailed.get(pullRequest.url)
		return detail && detail.headRefOid === pullRequest.headRefOid ? mergePullRequestDetail(pullRequest, detail) : pullRequest
	})
}

const publishSections = (snapshot: SectionsSnapshot) =>
	Effect.gen(function* () {
		yield* Atom.set(sectionStatesAtom, snapshot.sections)
		yield* Atom.update(queueLoadCacheAtom, (cache) => ({
			...cache,
			[SECTIONS_VIEW_CACHE_KEY]: {
				view: sectionsView,
				data: keepHydratedDetail(cache[SECTIONS_VIEW_CACHE_KEY]?.data ?? [], snapshot.pullRequests),
				fetchedAt: new Date(),
				endCursor: null,
				hasNextPage: false,
			},
		}))
	})

const loadSectionsView = Effect.gen(function* () {
	const github = yield* GitHubService
	const cacheService = yield* CacheService
	const loaded = yield* Effect.promise(() => loadSectionsConfig())
	yield* Atom.set(sectionsConfigErrorAtom, loaded.error)
	const snapshot = yield* loadSections(loaded.config, {
		viewer: github.getAuthenticatedUser(),
		viewerTeams: github.listViewerTeams(),
		teamMembers: (org, team) => github.listTeamMembers(org, team),
		search: (query, limit) => github.searchPullRequests(query, limit),
		readCached: (viewer, key) => cacheService.readSectionSnapshot(viewer, key).pipe(Effect.map((load) => load?.data ?? null)),
		writeCached: (viewer, key, pullRequests) => cacheService.writeSectionSnapshot(viewer, key, pullRequests, new Date()),
		publish: publishSections,
	})
	devLog("pullRequestsAtom:sections", { sections: snapshot.sections.map((section) => [section.id, section.status, section.urls.length]) })
	const cached = (yield* Atom.get(queueLoadCacheAtom))[SECTIONS_VIEW_CACHE_KEY]
	return cached ?? { view: sectionsView, data: snapshot.pullRequests, fetchedAt: new Date(), endCursor: null, hasNextPage: false }
})

// === Data-fetching atoms ===
//

export const pullRequestsAtom = githubRuntime.atom(
	Effect.fnUntraced(function* (get) {
		const view = get(activeViewAtom)
		if (view._tag === "Sections") return yield* loadSectionsView
		const github = yield* GitHubService
		const cacheService = yield* CacheService
		const cacheKey = viewCacheKey(view)
		devLog("pullRequestsAtom:start", { view, cacheKey })
		const load = yield* loadItemQueue(view, queueLoadCacheAtom, {
			keyOfView: viewCacheKey,
			getAuthenticatedUser: github.getAuthenticatedUser(),
			readCached: (viewer, queueView) => cacheService.readQueue(viewer, queueView),
			writeCached: (viewer, queueLoad) => cacheService.writeQueue(viewer, queueLoad),
			fetchFirstPage: (queueView) =>
				Effect.gen(function* () {
					const listInput = viewToListInput(queueView, null, Math.min(pullRequestPageSize, config.prFetchLimit))
					devLog("pullRequestsAtom:fetch", { cacheKey, listInput, query: searchQualifier(listInput) })
					return yield* retryItemQueueFirstPage(github.listPullRequestPage(listInput), retryProgressAtom)
				}),
			freshLoad: (queueView, page, existing) => freshPullRequestLoad(queueView, page, existing, config.prFetchLimit),
			trimCache: trimQueueLoadCache,
		})
		devLog("pullRequestsAtom:done", {
			cacheKey,
			loadView: load.view,
			dataLen: load.data.length,
			sampleAuthors: load.data.slice(0, 8).map((pr) => pr.author),
		})
		return load
	}),
)

export const usernameAtom = githubRuntime.atom(GitHubService.use((github) => github.getAuthenticatedUser())).pipe(Atom.keepAlive)

export const listOpenPullRequestPageAtom = githubRuntime.fn<ItemListInput<"pullRequest">>()((input) => GitHubService.use((github) => github.listPullRequestPage(input)))

// Family of one atom per repository. The empty string is a sentinel "no
// selection" — the atom resolves to null without hitting the service, so the
// caller can read it unconditionally from React.
//
// These are singleton imperative actions; repository is their input value.
export const readCachedRepositoryDetailsAtom = githubRuntime.fn<string>()((repository) => CacheService.use((cache) => cache.readRepositoryDetails(repository)))
export const writeRepositoryDetailsAtom = githubRuntime.fn<RepositoryDetails>()((details) => CacheService.use((cache) => cache.writeRepositoryDetails(details)))
export const fetchRepositoryDetailsAtom = githubRuntime.fn<string>()((repository) => GitHubService.use((github) => github.getRepositoryDetails(repository)))

// Background hydration of `repository_details` for the user's set of repos
// (favorites + recents + cwd). Skips fetches for repos whose cached row is
// younger than `REPO_DETAILS_PREWARM_TTL_MS`. Errors are swallowed — this is
// an opportunistic warm-up, not a critical path.
const REPO_DETAILS_PREWARM_TTL_MS = 6 * 60 * 60 * 1000
const REPO_DETAILS_PREWARM_CONCURRENCY = 4

export const prewarmRepositoryDetailsAtom = githubRuntime.fn<readonly string[]>()((repositories) =>
	Effect.forEach(
		repositories,
		(repository) =>
			Effect.gen(function* () {
				const cache = yield* CacheService
				// Seed the in-memory atom from SQLite first so RepoDetailPane can
				// render stats on the first frame — without this, useRepositoryDetails
				// has to wait one async hop before it can fill the cache itself.
				const cached = yield* cache.readRepositoryDetails(repository).pipe(Effect.catch(() => Effect.succeed(null)))
				if (cached) {
					yield* Atom.update(repositoryDetailsCacheAtom, (current) => (current[repository] ? current : { ...current, [repository]: cached }))
				}
				const fetchedAt = yield* cache.readRepositoryDetailsFetchedAt(repository).pipe(Effect.catch(() => Effect.succeed(null)))
				if (fetchedAt && Date.now() - fetchedAt.getTime() < REPO_DETAILS_PREWARM_TTL_MS) return
				const fresh = yield* GitHubService.use((github) => github.getRepositoryDetails(repository))
				yield* cache.writeRepositoryDetails(fresh)
				yield* Atom.update(repositoryDetailsCacheAtom, (current) => ({ ...current, [repository]: fresh }))
			}).pipe(Effect.catch(() => Effect.void)),
		{ concurrency: REPO_DETAILS_PREWARM_CONCURRENCY, discard: true },
	),
)

const applyPullRequestDetail = (loads: Partial<Record<string, PullRequestLoad>>, detail: PullRequestItem) => {
	let changed = false
	const next = { ...loads }
	for (const [cacheKey, load] of Object.entries(loads)) {
		if (!load) continue
		const index = load.data.findIndex((pullRequest) => pullRequest.url === detail.url)
		if (index < 0) continue
		const data = [...load.data]
		data[index] = mergePullRequestDetail(load.data[index]!, detail)
		next[cacheKey] = { ...load, data }
		changed = true
	}
	return changed ? next : loads
}

const applyCompletedPullRequestDetail = (completed: Readonly<Record<string, PullRequestItem>>, detail: PullRequestItem) => {
	const current = completed[detail.url]
	if (!current) return completed
	return {
		...completed,
		[detail.url]: mergePullRequestDetail(current, detail),
	}
}

// Each PR revision gets its own async atom and Effect lifetime. `Atom.family`
// weakly memoizes members, while `AtomRegistry.getResult` temporarily mounts a
// requested member until it settles. This keeps concurrent detail requests
// isolated by key; a singleton `runtime.fn` would be latest-wins and let one PR
// invocation interrupt another.
export const pullRequestDetailsForRevision = Atom.family((revisionKey: string) =>
	githubRuntime
		.atom(
			Effect.gen(function* () {
				const { repository, number } = parsePullRequestRevisionAtomKey(revisionKey, "detail")
				const cache = yield* CacheService
				const github = yield* GitHubService
				const cached = yield* cache.readPullRequest({ repository, number }).pipe(Effect.catch(() => Effect.succeed(null)))
				if (cached?.detailLoaded && pullRequestRevisionAtomKey(cached) === revisionKey) {
					yield* Atom.update(queueLoadCacheAtom, (loads) => applyPullRequestDetail(loads, cached))
					yield* Atom.update(recentlyCompletedPullRequestsAtom, (completed) => applyCompletedPullRequestDetail(completed, cached))
				}
				const detail = yield* github.getPullRequestDetails(repository, number)
				if (pullRequestRevisionAtomKey(detail) !== revisionKey) return detail
				const loads = yield* Atom.get(queueLoadCacheAtom)
				const completed = yield* Atom.get(recentlyCompletedPullRequestsAtom)
				const summary =
					Object.values(loads)
						.flatMap((load) => load?.data ?? [])
						.find((pullRequest) => pullRequest.url === detail.url) ?? completed[detail.url]
				const mergedDetail = summary ? mergePullRequestDetail(summary, detail) : detail
				yield* Atom.update(queueLoadCacheAtom, (current) => applyPullRequestDetail(current, mergedDetail))
				yield* Atom.update(recentlyCompletedPullRequestsAtom, (current) => applyCompletedPullRequestDetail(current, mergedDetail))
				yield* cache.upsertPullRequest(mergedDetail).pipe(Effect.catch(() => Effect.void))
				return mergedDetail
			}),
		)
		.pipe(Atom.setIdleTTL(0)),
)

export const writeQueueCacheAtom = githubRuntime.fn<{ readonly viewer: string; readonly load: PullRequestLoad }>()(({ viewer, load }) =>
	CacheService.use((cache) => cache.writeQueue(viewer, load)),
)
export const pruneCacheAtom = githubRuntime.fn<void>()(() => CacheService.use((cache) => cache.prune()))

export const addPullRequestLabelAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly label: string }>()((input) =>
	GitHubService.use((github) => github.addPullRequestLabel(input.repository, input.number, input.label)),
)
export const removePullRequestLabelAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly label: string }>()((input) =>
	GitHubService.use((github) => github.removePullRequestLabel(input.repository, input.number, input.label)),
)
export const toggleDraftAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly isDraft: boolean }>()((input) =>
	GitHubService.use((github) => github.toggleDraftStatus(input.repository, input.number, input.isDraft)),
)

export const getPullRequestMergeInfoAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.getPullRequestMergeInfo(input.repository, input.number)),
)
export const getRepositoryMergeMethodsAtom = githubRuntime.fn<string>()((repository) => GitHubService.use((github) => github.getRepositoryMergeMethods(repository)))
export const mergePullRequestAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly action: PullRequestMergeAction }>()((input) =>
	GitHubService.use((github) => github.mergePullRequest(input.repository, input.number, input.action)),
)
export const closePullRequestAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.closePullRequest(input.repository, input.number)),
)

// === Derived atoms (PR list pipeline) ===
// Pure resolver for the current view's load: prefer the in-memory cache for
// the active view; fall back to the latest resolved fetch only if its view
// matches. Inlined into every consumer instead of going through a
// an intermediate load atom — derived atoms that read multiple
// upstream atoms can fail to re-evaluate cleanly under effect-atom's dep
// propagation for certain transitions (reproduced by switching
// Repository(X) -> Queue(authored, X)), leaving stale `view`/`data` for
// the new active view. Reading the underlying atoms in each consumer puts
// that consumer on the underlying atoms' dep graph directly, which DOES
// re-evaluate, so the fix is uniform.
export const resolveLoad = (
	view: PullRequestView,
	cache: Partial<Record<string, PullRequestLoad>>,
	result: AsyncResult.AsyncResult<PullRequestLoad, unknown>,
): PullRequestLoad | null => resolveItemLoad(view, cache, result, viewCacheKey)

const getCurrentPullRequestsResult = (get: Atom.AtomContext) => get(pullRequestsAtom)

const cachedPullRequestLoad = (get: Atom.AtomContext): PullRequestLoad | null => get(queueLoadCacheAtom)[viewCacheKey(get(activeViewAtom))] ?? null

export const pullRequestStatusAtom = Atom.make((get): LoadStatus => {
	const result = getCurrentPullRequestsResult(get)
	const load = resolveLoad(get(activeViewAtom), get(queueLoadCacheAtom), result)
	if (result.waiting && load === null) return "loading"
	if (AsyncResult.isFailure(result) && load === null) return "error"
	return "ready"
})

export const activeViewsAtom = Atom.make((get) => activePullRequestViews(get(activeViewAtom)))
export const loadedPullRequestCountAtom = Atom.make((get) => cachedPullRequestLoad(get)?.data.length ?? 0)
export const hasMorePullRequestsAtom = Atom.make((get) => {
	const load = cachedPullRequestLoad(get)
	return Boolean(load?.hasNextPage && load.data.length < config.prFetchLimit)
})

// Queue cache key currently being load-more'd, or null if no fetch is in
// flight. Lives in atom-land so command bodies + commands.disabledReason can
// read the loading state without going through the useLoadMore hook return.
export const loadingMoreKeyAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

export const isLoadingMorePullRequestsAtom = Atom.make((get) => {
	const key = get(loadingMoreKeyAtom)
	return key !== null && key === viewCacheKey(get(activeViewAtom))
})

export const pullRequestFetchInFlightAtom = Atom.make((get) => getCurrentPullRequestsResult(get).waiting)

export const pullRequestLoadMoreSlotAvailableAtom = Atom.make((get) => {
	return !get(pullRequestFetchInFlightAtom) && get(effectiveFilterQueryAtom).length === 0 && get(hasMorePullRequestsAtom) && get(visiblePullRequestsAtom).length > 0
})

// Selection rests on the load-more pseudo-row when the index is one past the
// last visible PR. Surfaces an explicit boolean so the keymap layer can branch
// Enter onto `loadMorePullRequests` instead of `detail.open`, and the renderer
// can highlight the row.
export const loadMoreRowSelectedAtom = Atom.make((get) => {
	const visible = get(visiblePullRequestsAtom)
	return get(pullRequestLoadMoreSlotAvailableAtom) && get(selectedIndexAtom) === visible.length
})

export const displayedPullRequestsAtom = Atom.make((get) => {
	const view = get(activeViewAtom)
	// Fetches publish successful/cached loads into this keyed display cache.
	const load = get(queueLoadCacheAtom)[viewCacheKey(view)] ?? null
	const overrides = get(pullRequestOverridesAtom)
	const recentlyCompleted = get(recentlyCompletedPullRequestsAtom)
	const scope = viewRepository(view)
	devLog("displayedPullRequestsAtom", {
		view,
		scope,
		loadView: load?.view,
		loadDataLen: load?.data.length ?? 0,
		overridesCount: Object.keys(overrides).length,
		recentlyCompletedCount: Object.keys(recentlyCompleted).length,
	})
	// Defensive scope filter: when a repository is selected, only show PRs
	// for that repo. Without this, stale cache entries or orphans from
	// `recentlyCompletedPullRequestsAtom` (which is a global url→pr map)
	// can leak across views and surface PRs from the previous repository
	// under the new breadcrumb.
	const inScope = (pullRequest: PullRequestItem) => scope === null || pullRequest.repository === scope
	const source = (load?.data ?? []).filter(inScope)
	const seenUrls = new Set<string>()
	const open = source.map((pullRequest) => {
		seenUrls.add(pullRequest.url)
		return recentlyCompleted[pullRequest.url] ?? overrides[pullRequest.url] ?? pullRequest
	})
	const orphans = Object.values(recentlyCompleted).filter((pullRequest) => inScope(pullRequest) && !seenUrls.has(pullRequest.url))
	// Sort by updatedAt DESC. Server already sorts this way, but pagination
	// drift and merged orphans can scramble the order — guarantee it here.
	return [...open, ...orphans].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
})

export const filteredPullRequestsAtom = Atom.make((get) => {
	// Scope filtering ("only mine") is enforced server-side via the view's
	// search qualifier; no client-side author filter is needed here.
	const pullRequests = get(displayedPullRequestsAtom)
	const query = get(effectiveFilterQueryAtom)
	return filterPullRequests(pullRequests, query, filterContext(get))
})

// Context for section `where:` rules: no `section:` lookup (that would be circular).
const baseFilterContext = (get: Atom.AtomContext) => {
	const username = get(usernameAtom)
	const reviews = get(agentReviewIndexAtom)
	const lookups: FilterLookups = {
		...unknownFilterLookups,
		risk: (pullRequest) => briefRisk(briefStatusFor(reviews, pullRequest)) ?? "unknown",
		brief: (pullRequest) => briefFilterValue(briefStatusFor(reviews, pullRequest)),
	}
	return makeFilterContext({ now: new Date(), lookups, ...(AsyncResult.isSuccess(username) ? { viewer: username.value } : {}) })
}

/**
 * url → section ids, assigned over the (unfiltered) sections load so
 * `section:<id>` works from any view. Null until sections have loaded.
 */
export const sectionMembershipAtom = Atom.make((get): ReadonlyMap<string, readonly string[]> | null => {
	const states = get(sectionStatesAtom)
	const load = get(queueLoadCacheAtom)[SECTIONS_VIEW_CACHE_KEY]
	if (states.length === 0 || !load) return null
	const byUrl = new Map(load.data.map((pullRequest) => [pullRequest.url, pullRequest]))
	const membership = new Map(states.map((state) => [state.id, state.urls]))
	return sectionMembershipByUrl(assignSections(states, membership, byUrl, baseFilterContext(get)))
})

const filterContext = (get: Atom.AtomContext) => {
	const base = baseFilterContext(get)
	const section = sectionLookup(get(sectionStatesAtom), get(sectionMembershipAtom))
	return { ...base, lookups: { ...base.lookups, section } }
}

export interface SectionGroupView {
	readonly id: string
	readonly title: string
	readonly status: SectionStatus
	readonly error: string | null
	readonly note: string | null
	readonly collapsed: boolean
	readonly pullRequests: readonly PullRequestItem[]
}

/** Every configured section with its assigned PRs, including collapsed and empty ones. Empty outside the sections view. */
export const sectionGroupsAtom = Atom.make((get): readonly SectionGroupView[] => {
	if (get(activeViewAtom)._tag !== "Sections") return []
	const states = get(sectionStatesAtom)
	const collapsed = get(collapsedSectionsAtom)
	const pullRequests = get(filteredPullRequestsAtom)
	const byUrl = new Map(pullRequests.map((pullRequest) => [pullRequest.url, pullRequest]))
	const membership = new Map(states.map((state) => [state.id, state.urls]))
	const groups = assignSections(states, membership, byUrl, baseFilterContext(get))
	// With `/` free text, rank PRs inside each section by match score (the
	// order of filteredPullRequestsAtom) instead of the section's sort.
	const ranked = parseFilterQuery(get(effectiveFilterQueryAtom)).text.trim().length > 0
	const rank = ranked ? new Map(pullRequests.map((pullRequest, index) => [pullRequest.url, index])) : null
	const byRank = (items: readonly PullRequestItem[]) => (rank ? [...items].sort((left, right) => rank.get(left.url)! - rank.get(right.url)!) : items)
	return states.map((state, index) => ({
		id: state.id,
		title: state.title,
		status: state.status,
		error: state.error,
		note: state.note,
		collapsed: collapsed[state.id] ?? state.collapsed,
		pullRequests: byRank(groups[index]!.pullRequests),
	}))
})

export const visibleRepoOrderAtom = Atom.make((get) => {
	const pullRequests = get(filteredPullRequestsAtom)
	const query = get(effectiveFilterQueryAtom)
	// While the user is filtering, the ranked filter score drives the order so
	// the best-matching repo stays at the top. Without a query, sort projects
	// by their newest-opened PR so freshly-active repos surface first.
	if (query.length > 0) return [...new Set(pullRequests.map((pullRequest) => pullRequest.repository))]
	const newestByRepository = new Map<string, number>()
	for (const pullRequest of pullRequests) {
		const created = pullRequest.createdAt.getTime()
		const previous = newestByRepository.get(pullRequest.repository)
		if (previous === undefined || created > previous) newestByRepository.set(pullRequest.repository, created)
	}
	return [...newestByRepository.entries()]
		.sort(([leftRepo, leftCreated], [rightRepo, rightCreated]) => rightCreated - leftCreated || leftRepo.localeCompare(rightRepo))
		.map(([repo]) => repo)
})

export const visibleGroupsAtom = Atom.make((get): Array<[string, PullRequestItem[]]> => {
	if (get(activeViewAtom)._tag === "Sections") {
		return get(sectionGroupsAtom)
			.filter((group) => !group.collapsed && group.pullRequests.length > 0)
			.map((group) => [group.id, [...group.pullRequests]])
	}
	return groupBy(get(filteredPullRequestsAtom), (pullRequest) => pullRequest.repository, get(visibleRepoOrderAtom))
})

export const visiblePullRequestsAtom = Atom.make((get) => get(visibleGroupsAtom).flatMap(([, pullRequests]) => pullRequests))

export const groupStartsAtom = Atom.make((get) => {
	const groups = get(visibleGroupsAtom)
	const starts: number[] = []
	for (let index = 0; index < groups.length; index++) {
		if (index === 0) starts.push(0)
		else starts.push(starts[index - 1]! + groups[index - 1]![1].length)
	}
	return starts
})

export const selectedPullRequestAtom = Atom.make((get) => {
	const pullRequests = get(visiblePullRequestsAtom)
	const index = get(selectedIndexAtom)
	return pullRequests[index] ?? null
})
