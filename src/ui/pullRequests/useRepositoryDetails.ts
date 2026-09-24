import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useEffect } from "react"
import type { RepositoryDetails } from "../../domain.js"
import { fetchRepositoryDetailsAtom, readCachedRepositoryDetailsAtom, repositoryDetailsCacheAtom, writeRepositoryDetailsAtom } from "./atoms.js"

/**
 * Returns repository metadata (description, stars, open PR/issue counts,
 * etc.) for the given repo, hydrating the in-memory cache from SQLite first
 * and then refreshing from GitHub. Returns `null` while the cache is empty.
 *
 * Both writes (SQLite + in-memory) happen unconditionally on successful
 * fetch; the SQLite read is best-effort and only used to show last-known
 * data immediately while the network call lands.
 */
export const useRepositoryDetails = (repository: string | null): RepositoryDetails | null => {
	const cache = useAtomValue(repositoryDetailsCacheAtom)
	const setCache = useAtomSet(repositoryDetailsCacheAtom)
	const readCached = useAtomSet(readCachedRepositoryDetailsAtom, { mode: "promise" })
	const fetchDetails = useAtomSet(fetchRepositoryDetailsAtom, { mode: "promise" })
	const writeCached = useAtomSet(writeRepositoryDetailsAtom, { mode: "promise" })

	const cached = repository ? (cache[repository] ?? null) : null

	useEffect(() => {
		if (!repository) return
		let cancelled = false
		void (async () => {
			if (!cache[repository]) {
				const fromDisk = await readCached(repository).catch(() => null)
				if (cancelled) return
				if (fromDisk) setCache((current) => (current[repository] ? current : { ...current, [repository]: fromDisk }))
			}
			try {
				const fresh = await fetchDetails(repository)
				if (cancelled) return
				setCache((current) => ({ ...current, [repository]: fresh }))
				void writeCached(fresh).catch(() => {})
			} catch {
				// Fall back to whatever's already in the cache.
			}
		})()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [repository])

	return cached
}
