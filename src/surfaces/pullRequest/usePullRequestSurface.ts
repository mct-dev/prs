import { RegistryContext, useAtom, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ScrollBoxRenderable } from "@opentui/core"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Cause } from "effect"
import { type MutableRefObject, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react"
import type { LoadStatus, PullRequestItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import { type PullRequestView, viewCacheKey } from "../../pullRequestViews.js"
import { type PullRequestLoad } from "../../pullRequestLoad.js"
import { useDetailHydration, type DetailHydrationState } from "../../ui/pullRequests/useDetailHydration.js"
import { useLoadMore } from "../../ui/pullRequests/useLoadMore.js"
import { useRefreshCompletionToast } from "../../ui/pullRequests/useRefreshCompletionToast.js"
import { useFocusReturnRefresh } from "../../hooks/useFocusReturnRefresh.js"
import { usePullRequestRefresh } from "../../hooks/usePullRequestRefresh.js"
import { RetryProgress } from "../../ui/FooterHints.js"
import { pullRequestCommentsAtom, pullRequestCommentsLoadedAtom } from "../../ui/comments/atoms.js"
import { noticeAtom } from "../../ui/notice/atoms.js"
import { effectiveFilterQueryAtom } from "../../ui/filter/atoms.js"
import {
	activeViewAtom,
	activeViewsAtom,
	collapsedSectionsAtom,
	sectionCursorAtom,
	displayedPullRequestsAtom,
	groupStartsAtom,
	hasMorePullRequestsAtom,
	loadMoreRowSelectedAtom,
	loadedPullRequestCountAtom,
	pullRequestOverridesAtom,
	pullRequestLoadMoreSlotAvailableAtom,
	pullRequestsAtom,
	queueLoadCacheAtom,
	recentlyCompletedPullRequestsAtom,
	resolveLoad,
	retryProgressAtom,
	sectionGroupsAtom,
	sectionReasonForAtom,
	sectionsConfigErrorAtom,
	selectedPullRequestAtom,
	visibleGroupsAtom,
	visiblePullRequestsAtom,
} from "../../ui/pullRequests/atoms.js"
import { describeFilterQuery } from "../../filter/parse.js"
import {
	activeSectionId,
	focusedSectionHeaderId,
	type SectionNavGroup,
	type SectionNavResult,
	type SectionSelection,
	stepSection,
	toggleAllSectionsAt,
	toggleSectionAt,
} from "../../sections/cursor.js"
import { buildPullRequestListRows, pullRequestListRowIndex, type PullRequestGroups, type PullRequestListRow, type PullRequestSections } from "../../ui/PullRequestList.js"
import { useScrollFollowSelected } from "../../ui/useScrollFollowSelected.js"
import { useScrollPersistence } from "../../ui/useScrollPersistence.js"
import { AUTO_REFRESH_JITTER_MS, FOCUS_RETURN_REFRESH_MIN_MS, FOCUSED_IDLE_REFRESH_MS } from "../../workspace/placeholders.js"
import { selectedRepositoryAtom } from "../../workspace/atoms.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"

type SetState<T> = (next: T | ((prev: T) => T)) => void

// Structural type for the bits of the OpenTUI renderer that
// `useFocusReturnRefresh` needs — keeps the Surface decoupled from the
// concrete `Renderer` class.
interface RendererFocusEvents {
	on: (event: "focus" | "blur", handler: () => void) => void
	off: (event: "focus" | "blur", handler: () => void) => void
}

export interface UsePullRequestSurfaceInput {
	readonly renderer: RendererFocusEvents
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly username: string | null
	readonly selectedIndex: number
	readonly setSelectedIndex: SetState<number>
	readonly setQueueSelection: SetState<Partial<Record<string, number>>>
	readonly visibleFilterText: string
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly detailFullView: boolean
	readonly diffFullView: boolean
	readonly commentsViewActive: boolean
	readonly flashNotice: (message: string) => void
	readonly prListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly prListScrollPersistedRef: MutableRefObject<number>
}

export interface PullRequestSurfaceShell {
	readonly isFullscreen: boolean
	// Async result + derived status
	readonly pullRequestResult: AsyncResult.AsyncResult<unknown, unknown>
	readonly pullRequestStatus: LoadStatus
	readonly pullRequestError: string | null
	readonly pullRequestFetchInFlight: boolean
	readonly isInitialLoading: (startupLoadComplete: boolean) => boolean
	// View + pagination state
	readonly activeView: PullRequestView
	readonly setActiveView: (next: PullRequestView) => void
	readonly activeViews: readonly PullRequestView[]
	readonly currentQueueCacheKey: string
	readonly pullRequestLoad: PullRequestLoad | null
	readonly setQueueLoadCache: SetState<Partial<Record<string, PullRequestLoad>>>
	readonly hasMorePullRequests: boolean
	readonly loadedPullRequestCount: number
	readonly loadMoreRowSelected: boolean
	readonly loadMoreSlotAvailable: boolean
	// PR list + selection
	readonly pullRequests: readonly PullRequestItem[]
	readonly visiblePullRequests: readonly PullRequestItem[]
	readonly visibleGroups: PullRequestGroups
	readonly groupStarts: readonly number[]
	readonly selectedPullRequest: PullRequestItem | null
	readonly selectedRepository: string | null
	readonly pullRequestActiveFilterLabel: string | null
	readonly compactPullRequestRows: boolean
	/** Section headers when the sections view is active, else null. */
	readonly pullRequestSections: PullRequestSections | null
	/** Collapse or expand one section; no-op outside the sections view. */
	readonly toggleSection: (id: string) => void
	/** Collapse every section, or expand all when all are collapsed. */
	readonly toggleAllSections: () => void
	/** Collapse or expand the section containing the selected PR. */
	readonly toggleSelectedSection: () => void
	/** `[` / `]` in the sections view. */
	readonly stepSectionBy: (delta: 1 | -1) => void
	readonly pullRequestListRows: readonly PullRequestListRow[]
	readonly selectedPullRequestRowIndex: number | null
	// Atom setters re-exposed for App-shell-level consumers (modals, mutations,
	// workspace navigation). Will dissolve once those consumers read atoms
	// directly via the command registry (step 5).
	readonly setPullRequestOverrides: SetState<Readonly<Record<string, PullRequestItem>>>
	readonly setRecentlyCompletedPullRequests: SetState<Readonly<Record<string, PullRequestItem>>>
	readonly retryProgress: RetryProgress
	// Load-more + refresh subsystems
	readonly loadMorePullRequests: () => boolean
	readonly isLoadingMorePullRequests: boolean
	readonly resetLoadingMore: () => void
	readonly armRefreshToast: (message: string) => void
	readonly cancelRefreshToast: () => void
	readonly refreshPullRequests: (message?: string, options?: { readonly resetTransientState?: boolean }) => void
	readonly detailHydrationState: Record<string, DetailHydrationState>
	readonly resetHydration: () => void
	// Selection helper used by link navigation + comment view jump
	readonly selectPullRequestByUrl: (url: string) => void
}

// PR Surface shell — step 4a. Owns the PR data layer:
//   • PR atom reads (queue, list, status, selection, repository).
//   • `useLoadMore` + `useDetailHydration` + the refresh subsystem
//     (`useFocusReturnRefresh` + `useRefreshCompletionToast` +
//     `usePullRequestRefresh`).
//   • PR list-row build, the row-index lookup that drives the scroll-follow
//     effect, and the scroll persistence wiring for the PR list.
//
// Refs that gate the refresh state machine
// (`lastPullRequestRefreshAtRef`, `pullRequestStatusRef`,
// `refreshPullRequestsRef`, `maybeRefreshPullRequestsRef`) live here because
// they're only read/written by the four refresh hooks above.
//
// The shell exposes its setters (overrides, recently-completed) so App-shell
// can wire them into `useItemMutations` and `useWorkspaceNavigation` during
// the transition. Once commands read atoms directly (step 5) the setters
// stop crossing the boundary.
export const usePullRequestSurface = (input: UsePullRequestSurfaceInput): PullRequestSurfaceShell => {
	const {
		renderer,
		refreshGenerationRef,
		username,
		selectedIndex,
		setSelectedIndex,
		setQueueSelection,
		visibleFilterText,
		activeWorkspaceSurface,
		detailFullView,
		diffFullView,
		commentsViewActive,
		flashNotice,
		prListScrollRef,
		prListScrollPersistedRef,
	} = input
	const registry = useContext(RegistryContext)

	// Refresh refs — Surface-internal; passed to refresh sub-hooks below.
	const lastPullRequestRefreshAtRef = useRef(0)
	const pullRequestStatusRef = useRef<LoadStatus>("loading")
	const refreshPullRequestsRef = useRef<(message?: string, options?: { readonly resetTransientState?: boolean }) => void>(() => {})
	const maybeRefreshPullRequestsRef = useRef<(minimumAgeMs: number) => void>(() => {})

	// PR atom reads.
	// The queue atom tracks `activeViewAtom`; view changes interrupt the old
	// request and start the new query while keyed queue data remains cached.
	const [activeView, setActiveView] = useAtom(activeViewAtom)
	const pullRequestResult = useAtomValue(pullRequestsAtom)
	const refreshCurrentPullRequestsAtom = useAtomRefresh(pullRequestsAtom)
	const refreshPullRequestsAtom = useCallback(() => {
		if (registry.get(pullRequestsAtom).waiting) return
		refreshCurrentPullRequestsAtom()
	}, [registry, refreshCurrentPullRequestsAtom])
	const queueLoadCache = useAtomValue(queueLoadCacheAtom)
	const setQueueLoadCache = useAtomSet(queueLoadCacheAtom)
	const setPullRequestOverrides = useAtomSet(pullRequestOverridesAtom)
	const setRecentlyCompletedPullRequests = useAtomSet(recentlyCompletedPullRequestsAtom)
	const setPullRequestComments = useAtomSet(pullRequestCommentsAtom)
	const setPullRequestCommentsLoaded = useAtomSet(pullRequestCommentsLoadedAtom)
	const setNotice = useAtomSet(noticeAtom)
	const retryProgress = useAtomValue(retryProgressAtom)

	const pullRequestLoad = useMemo(() => resolveLoad(activeView, queueLoadCache, pullRequestResult), [activeView, queueLoadCache, pullRequestResult])
	const pullRequests = useAtomValue(displayedPullRequestsAtom)
	const pullRequestStatus: LoadStatus =
		pullRequestResult.waiting && pullRequestLoad === null ? "loading" : AsyncResult.isFailure(pullRequestResult) && pullRequestLoad === null ? "error" : "ready"
	const pullRequestFetchInFlight = pullRequestResult.waiting
	const selectedRepository = useAtomValue(selectedRepositoryAtom)
	const pullRequestAuthorFilterActive = selectedRepository !== null && activeView._tag === "Queue" && activeView.mode === "authored"
	const effectiveFilterQuery = useAtomValue(effectiveFilterQueryAtom)
	const describedFilter = effectiveFilterQuery.length > 0 ? describeFilterQuery(effectiveFilterQuery) : ""
	const pullRequestActiveFilterLabel =
		[pullRequestAuthorFilterActive ? "author:@me" : null, describedFilter.length > 0 ? describedFilter : null].filter((part) => part !== null).join(" · ") || null
	const compactPullRequestRows = activeView._tag === "Queue" && activeView.mode === "authored"
	const pullRequestError = AsyncResult.isFailure(pullRequestResult) ? errorMessage(Cause.squash(pullRequestResult.cause)) : null

	const visibleGroups = useAtomValue(visibleGroupsAtom)
	const visiblePullRequests = useAtomValue(visiblePullRequestsAtom)
	const selectedPullRequest = useAtomValue(selectedPullRequestAtom)
	const filterActive = effectiveFilterQuery.length > 0
	const sectionGroups = useAtomValue(sectionGroupsAtom)
	const sectionsConfigError = useAtomValue(sectionsConfigErrorAtom)
	const setCollapsedSections = useAtomSet(collapsedSectionsAtom)
	const [sectionCursor, setSectionCursor] = useAtom(sectionCursorAtom)
	const sectionNavGroups = useMemo<readonly SectionNavGroup[]>(
		() => sectionGroups.map((group) => ({ id: group.id, collapsed: group.collapsed, urls: group.pullRequests.map((pullRequest) => pullRequest.url) })),
		[sectionGroups],
	)
	const sectionSelection = useMemo<SectionSelection | null>(
		() => (selectedPullRequest ? { url: selectedPullRequest.url, index: selectedIndex } : null),
		[selectedPullRequest, selectedIndex],
	)
	const focusedSectionId = focusedSectionHeaderId(sectionNavGroups, sectionCursor, sectionSelection)
	const currentSectionId = activeSectionId(sectionNavGroups, sectionCursor, sectionSelection)
	const sectionReasonFor = useAtomValue(sectionReasonForAtom)
	const currentSectionSummary = sectionGroups.find((group) => group.id === currentSectionId)?.reason?.summary ?? null
	const selectedReasonText = selectedPullRequest && currentSectionId ? sectionReasonFor(selectedPullRequest, currentSectionId) : null
	// The row only repeats what the header says when it adds something (e.g. which team).
	const selectedSectionReason = selectedReasonText === currentSectionSummary ? null : selectedReasonText
	const pullRequestSections = useMemo<PullRequestSections | null>(
		() =>
			activeView._tag === "Sections"
				? {
						headers: sectionGroups.map((group) => ({
							id: group.id,
							title: group.title,
							status: group.status,
							error: group.error,
							note: group.note,
							collapsed: group.collapsed,
							count: group.pullRequests.length,
							focused: group.id === focusedSectionId,
							reason: group.id === currentSectionId ? (group.reason?.summary ?? null) : null,
						})),
						configError: sectionsConfigError,
						selectedReason: selectedSectionReason,
					}
				: null,
		[activeView._tag, sectionGroups, sectionsConfigError, focusedSectionId, currentSectionId, selectedSectionReason],
	)
	const activeViews = useAtomValue(activeViewsAtom)
	const currentQueueCacheKey = viewCacheKey(activeView)
	const loadedPullRequestCount = useAtomValue(loadedPullRequestCountAtom)
	const hasMorePullRequests = useAtomValue(hasMorePullRequestsAtom)
	const loadMoreRowSelected = useAtomValue(loadMoreRowSelectedAtom)
	const loadMoreSlotAvailable = useAtomValue(pullRequestLoadMoreSlotAvailableAtom)
	const groupStarts = useAtomValue(groupStartsAtom)
	const selectedUrlRef = useRef<{ readonly cacheKey: string; readonly url: string } | null>(null)
	const previousSelectionStateRef = useRef({ cacheKey: currentQueueCacheKey, visiblePullRequests, filterActive })

	useLayoutEffect(() => {
		const previous = previousSelectionStateRef.current
		const listChanged = previous.cacheKey !== currentQueueCacheKey || previous.visiblePullRequests !== visiblePullRequests
		const filterEnded = previous.cacheKey === currentQueueCacheKey && previous.filterActive && !filterActive
		const rememberedUrl = selectedUrlRef.current?.cacheKey === currentQueueCacheKey ? selectedUrlRef.current.url : null
		// The current row may already hold the url (e.g. a duplicate in a later section); keep it then.
		if (!filterActive && rememberedUrl && (listChanged || filterEnded) && visiblePullRequests[selectedIndex]?.url !== rememberedUrl) {
			const rememberedIndex = visiblePullRequests.findIndex((pullRequest) => pullRequest.url === rememberedUrl)
			if (rememberedIndex >= 0 && rememberedIndex !== selectedIndex) {
				setSelectedIndex(rememberedIndex)
				previousSelectionStateRef.current = { cacheKey: currentQueueCacheKey, visiblePullRequests, filterActive }
				return
			}
		}
		if (!filterActive && selectedPullRequest) selectedUrlRef.current = { cacheKey: currentQueueCacheKey, url: selectedPullRequest.url }
		previousSelectionStateRef.current = { cacheKey: currentQueueCacheKey, visiblePullRequests, filterActive }
	}, [currentQueueCacheKey, filterActive, selectedIndex, selectedPullRequest, setSelectedIndex, visiblePullRequests])

	pullRequestStatusRef.current = pullRequestStatus

	const { loadMorePullRequests, isLoadingMorePullRequests, resetLoadingMore } = useLoadMore({
		activeView,
		currentQueueCacheKey,
		pullRequestLoad,
		hasMorePullRequests,
		pullRequestFetchInFlight,
		username,
		refreshGenerationRef,
		flashNotice,
		setQueueLoadCache,
	})

	const pullRequestListRows = useMemo(
		() =>
			buildPullRequestListRows({
				groups: visibleGroups,
				status: pullRequestStatus,
				error: pullRequestError,
				filterText: visibleFilterText,
				loadedCount: loadedPullRequestCount,
				hasMore: loadMoreSlotAvailable,
				isLoadingMore: isLoadingMorePullRequests,
				compact: compactPullRequestRows,
				sections: pullRequestSections,
			}),
		[
			visibleGroups,
			pullRequestStatus,
			pullRequestError,
			visibleFilterText,
			loadedPullRequestCount,
			loadMoreSlotAvailable,
			isLoadingMorePullRequests,
			compactPullRequestRows,
			pullRequestSections,
		],
	)
	const selectedPullRequestRowIndex = pullRequestListRowIndex(pullRequestListRows, selectedPullRequest?.url ?? null, loadMoreRowSelected)

	const { detailHydrationState, resetHydration } = useDetailHydration({
		selectedPullRequest,
		pullRequestStatus,
		visiblePullRequests,
		selectedIndex,
		currentQueueCacheKey,
		refreshGenerationRef,
		queueFetchedAtMs: pullRequestLoad?.fetchedAt?.getTime() ?? null,
		flashNotice,
	})

	const { terminalFocusedRef } = useFocusReturnRefresh({
		renderer,
		lastRefreshAtRef: lastPullRequestRefreshAtRef,
		refreshGeneration: pullRequestLoad?.fetchedAt?.getTime(),
		focusReturnMinMs: FOCUS_RETURN_REFRESH_MIN_MS,
		idleAfterMs: FOCUSED_IDLE_REFRESH_MS,
		jitterMs: AUTO_REFRESH_JITTER_MS,
		// Skip the focus-return refresh while a load-more is in flight. A
		// concurrent queue refetch would otherwise clobber the pagination
		// merge (the cache write order isn't deterministic), reverting a
		// freshly-loaded next page.
		onRefresh: (ms) => {
			if (isLoadingMorePullRequests) return
			maybeRefreshPullRequestsRef.current(ms)
		},
	})

	const { armRefreshToast, cancelRefreshToast } = useRefreshCompletionToast({
		pullRequestStatus,
		pullRequestError,
		fetchedAt: pullRequestLoad?.fetchedAt?.getTime(),
		pullRequestLoad,
		selectedPullRequest,
		lastPullRequestRefreshAtRef,
		flashNotice,
	})

	const { refreshPullRequests } = usePullRequestRefresh({
		pullRequestLoad,
		pullRequestFetchInFlight,
		isLoadingMorePullRequests,
		refreshGenerationRef,
		lastPullRequestRefreshAtRef,
		pullRequestStatusRef,
		terminalFocusedRef,
		maybeRefreshPullRequestsRef,
		refreshPullRequestsRef,
		resetHydration,
		resetLoadingMore,
		setPullRequestOverrides,
		setRecentlyCompletedPullRequests,
		setPullRequestComments,
		setPullRequestCommentsLoaded,
		setNotice,
		armRefreshToast,
		refreshPullRequestsAtom,
	})

	useScrollFollowSelected(prListScrollRef, selectedPullRequestRowIndex)
	useScrollPersistence(prListScrollRef, prListScrollPersistedRef, activeWorkspaceSurface === "pullRequests" && !detailFullView && !diffFullView && !commentsViewActive)

	const selectPullRequestByUrl = (url: string) => {
		const index = visiblePullRequests.findIndex((pullRequest) => pullRequest.url === url)
		if (index >= 0) {
			setSelectedIndex(index)
			setQueueSelection((current) => ({ ...current, [currentQueueCacheKey]: index }))
		}
	}

	const applySectionNav = useCallback(
		(result: SectionNavResult | null) => {
			if (!result) return
			const { collapsed } = result
			if (collapsed) setCollapsedSections((current) => ({ ...current, ...collapsed }))
			setSectionCursor(result.cursor)
			if (result.selectIndex !== null && result.selectUrl !== null) {
				const index = result.selectIndex
				// Remember the new url first so the selection-recovery effect doesn't pull the old PR back.
				selectedUrlRef.current = { cacheKey: currentQueueCacheKey, url: result.selectUrl }
				setSelectedIndex(index)
				setQueueSelection((current) => ({ ...current, [currentQueueCacheKey]: index }))
			}
		},
		[currentQueueCacheKey, setCollapsedSections, setQueueSelection, setSectionCursor, setSelectedIndex],
	)
	const toggleSection = useCallback(
		(id: string) => applySectionNav(toggleSectionAt(sectionNavGroups, sectionCursor, sectionSelection, id)),
		[applySectionNav, sectionNavGroups, sectionCursor, sectionSelection],
	)
	const toggleSelectedSection = useCallback(
		() => applySectionNav(toggleSectionAt(sectionNavGroups, sectionCursor, sectionSelection)),
		[applySectionNav, sectionNavGroups, sectionCursor, sectionSelection],
	)
	const toggleAllSections = useCallback(
		() => applySectionNav(toggleAllSectionsAt(sectionNavGroups, sectionCursor, sectionSelection)),
		[applySectionNav, sectionNavGroups, sectionCursor, sectionSelection],
	)
	const stepSectionBy = useCallback(
		(delta: 1 | -1) => applySectionNav(stepSection(sectionNavGroups, sectionCursor, sectionSelection, delta)),
		[applySectionNav, sectionNavGroups, sectionCursor, sectionSelection],
	)

	// `isFullscreen` is provisionally `false` for the PR Surface here — the
	// detail/diff/comments full-view booleans still live in App-shell during
	// the transition. After step 4c (diff system collapse) and step 5
	// (atom-driven commands), this should derive from PR-Surface-owned
	// view-mode atoms.
	const isFullscreen = false

	return {
		isFullscreen,
		pullRequestResult,
		pullRequestStatus,
		pullRequestError,
		pullRequestFetchInFlight,
		isInitialLoading: (startupLoadComplete: boolean) => !startupLoadComplete && pullRequestStatus === "loading" && pullRequests.length === 0,
		activeView,
		setActiveView,
		activeViews,
		currentQueueCacheKey,
		pullRequestLoad,
		setQueueLoadCache,
		hasMorePullRequests,
		loadedPullRequestCount,
		loadMoreRowSelected,
		loadMoreSlotAvailable,
		pullRequests,
		visiblePullRequests,
		visibleGroups,
		groupStarts,
		selectedPullRequest,
		selectedRepository,
		pullRequestActiveFilterLabel,
		compactPullRequestRows,
		pullRequestSections,
		toggleSection,
		toggleAllSections,
		toggleSelectedSection,
		stepSectionBy,
		pullRequestListRows,
		selectedPullRequestRowIndex,
		setPullRequestOverrides,
		setRecentlyCompletedPullRequests,
		retryProgress,
		loadMorePullRequests,
		isLoadingMorePullRequests,
		resetLoadingMore,
		armRefreshToast,
		cancelRefreshToast,
		refreshPullRequests,
		detailHydrationState,
		resetHydration,
		selectPullRequestByUrl,
	}
}
