import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useMemo } from "react"
import type { IssueItem, PullRequestItem, RepositoryDetails } from "../../domain.js"
import { repositoryFilterScore } from "../../ui/filter/scoring.js"
import { useRepositoryDetails } from "../../ui/pullRequests/useRepositoryDetails.js"
import type { RepositoryListItem } from "../../ui/RepoList.js"
import { useClampedIndex } from "../../ui/useClampedIndex.js"
import { buildRepositoryItems, type CatalogEntry } from "../../workspace/repositoryItems.js"
import { favoriteRepositoriesAtom, recentRepositoriesAtom, repoRollupAtom, selectedRepositoryIndexAtom } from "../../workspace/atoms.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"
import type { RepoRollupRow } from "../../services/CacheService.js"

// Match @effect/atom-react's polymorphic setter: accepts either a value
// or an updater. Both forms are used across consumers (preferences
// persistence passes values; workspace nav passes updaters).
type SetState<T> = (next: T | ((prev: T) => T)) => void

export interface UseRepoSurfaceInput {
	readonly pullRequests: readonly PullRequestItem[]
	readonly allIssues: readonly IssueItem[]
	readonly visibleFilterText: string
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly detectedRepository: string | null
	readonly mockRepositoryCatalog: readonly CatalogEntry[]
	readonly flashNotice: (message: string) => void
}

export interface RepoSurfaceActions {
	readonly toggleFavoriteRepository: () => void
	readonly removeSelectedRepository: () => void
}

export interface RepoSurfaceShell {
	readonly isFullscreen: false
	readonly repositoryItems: readonly RepositoryListItem[]
	readonly selectedRepositoryItem: RepositoryListItem | null
	readonly selectedRepositoryDetails: RepositoryDetails | null
	readonly selectedRepositoryIndex: number
	readonly setSelectedRepositoryIndex: SetState<number>
	readonly favoriteRepositories: Readonly<Record<string, true>>
	readonly setFavoriteRepositories: SetState<Readonly<Record<string, true>>>
	readonly recentRepositories: readonly string[]
	readonly setRecentRepositories: SetState<readonly string[]>
	readonly repoRollup: readonly RepoRollupRow[]
	readonly setRepoRollup: (next: readonly RepoRollupRow[]) => void
	readonly actions: RepoSurfaceActions
}

// Repo Surface shell. Owns the repository list derivation, the in-flight
// repository-details fetch, selection clamping, and the repo-specific
// favorite/remove actions. `openSelectedRepository` is App-shell glue
// (it's just `switchViewTo({ _tag: "Repository", ... })`) and lives there
// to avoid cycling with `useWorkspaceNavigation`. Cross-surface concerns
// (preferences persistence, repo-rollup hydration on startup,
// navigation-driven recents updates) read the atoms or setters exposed
// in the return value.
export const useRepoSurface = (input: UseRepoSurfaceInput): RepoSurfaceShell => {
	const { pullRequests, allIssues, visibleFilterText, activeWorkspaceSurface, detectedRepository, mockRepositoryCatalog, flashNotice } = input

	const [selectedRepositoryIndex, setSelectedRepositoryIndex] = useAtom(selectedRepositoryIndexAtom)
	const [favoriteRepositories, setFavoriteRepositories] = useAtom(favoriteRepositoriesAtom)
	const [recentRepositories, setRecentRepositories] = useAtom(recentRepositoriesAtom)
	const repoRollup = useAtomValue(repoRollupAtom)
	const setRepoRollup = useAtomSet(repoRollupAtom)

	const allRepositoryItems = useMemo(
		(): readonly RepositoryListItem[] =>
			buildRepositoryItems({
				recentRepositories,
				favoriteRepositories,
				detectedRepository,
				repoRollup,
				pullRequests,
				allIssues,
				mockRepositoryCatalog,
			}),
		[favoriteRepositories, recentRepositories, pullRequests, allIssues, repoRollup, detectedRepository, mockRepositoryCatalog],
	)
	const repositoryItems = useMemo(
		() => (activeWorkspaceSurface === "repos" ? allRepositoryItems.filter((repository) => repositoryFilterScore(repository, visibleFilterText) !== null) : allRepositoryItems),
		[activeWorkspaceSurface, allRepositoryItems, visibleFilterText],
	)
	const selectedRepositoryItem = repositoryItems[Math.max(0, Math.min(selectedRepositoryIndex, repositoryItems.length - 1))] ?? null
	const selectedRepositoryDetails = useRepositoryDetails(selectedRepositoryItem?.repository ?? null)

	useClampedIndex(repositoryItems.length, setSelectedRepositoryIndex)

	const toggleFavoriteRepository = () => {
		if (!selectedRepositoryItem) return
		const repository = selectedRepositoryItem.repository
		setFavoriteRepositories((current) => {
			if (current[repository]) {
				const next = { ...current }
				delete next[repository]
				return next
			}
			return { ...current, [repository]: true }
		})
	}

	const removeSelectedRepository = () => {
		if (!selectedRepositoryItem) return
		const repository = selectedRepositoryItem.repository
		setFavoriteRepositories((current) => {
			if (!current[repository]) return current
			const next = { ...current }
			delete next[repository]
			return next
		})
		setRecentRepositories((current) => current.filter((item) => item !== repository))
		flashNotice(repository === detectedRepository ? `Removed saved state for ${repository}; current repo stays pinned` : `Removed ${repository} from tracked repositories`)
	}

	return {
		isFullscreen: false,
		repositoryItems,
		selectedRepositoryItem,
		selectedRepositoryDetails,
		selectedRepositoryIndex,
		setSelectedRepositoryIndex,
		favoriteRepositories,
		setFavoriteRepositories,
		recentRepositories,
		setRecentRepositories,
		repoRollup,
		setRepoRollup,
		actions: {
			toggleFavoriteRepository,
			removeSelectedRepository,
		},
	}
}
