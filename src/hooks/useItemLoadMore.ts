import { type MutableRefObject, useRef } from "react"
import { errorMessage } from "../errors.js"

type LoadMoreLoad = {
	readonly data: readonly unknown[]
	readonly endCursor: string | null
}

type SetLoadingMoreKey = (next: string | null | ((current: string | null) => string | null)) => void

export interface UseItemLoadMoreInput<Load extends LoadMoreLoad, Page> {
	readonly cacheKey: string
	readonly load: Load | null
	readonly hasMore: boolean
	readonly fetchInFlight: boolean
	readonly itemLimit: number
	readonly pageSize: number
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly loadingMoreKey: string | null
	readonly setLoadingMoreKey: SetLoadingMoreKey
	readonly fetchPage: (cursor: string, pageSize: number) => Promise<Page>
	readonly mergePage: (current: Load, page: Page) => Load
	readonly setLoadCache: (next: (current: Partial<Record<string, Load>>) => Partial<Record<string, Load>>) => void
	readonly persistLoad: (load: Load) => Promise<void> | void
	readonly flashNotice: (message: string) => void
	readonly timeoutMessage: string
}

export interface UseItemLoadMoreResult {
	readonly loadMore: () => boolean
	readonly isLoadingMore: boolean
	readonly resetLoadingMore: () => void
}

const LOAD_MORE_TIMEOUT_MS = 15_000

/** Shared pagination invocation state machine. Query construction, page merge,
 * persistence, and loading atoms remain owned by the typed Item adapters. */
export const useItemLoadMore = <Load extends LoadMoreLoad, Page>({
	cacheKey,
	load,
	hasMore,
	fetchInFlight,
	itemLimit,
	pageSize,
	refreshGenerationRef,
	loadingMoreKey,
	setLoadingMoreKey,
	fetchPage,
	mergePage,
	setLoadCache,
	persistLoad,
	flashNotice,
	timeoutMessage,
}: UseItemLoadMoreInput<Load, Page>): UseItemLoadMoreResult => {
	const inFlightRef = useRef<{ readonly key: string; readonly id: number } | null>(null)
	const requestIdRef = useRef(0)

	const loadMore = (): boolean => {
		if (inFlightRef.current !== null || fetchInFlight) return false
		if (!load || !hasMore || !load.endCursor) return false
		const remaining = itemLimit - load.data.length
		if (remaining <= 0) return false

		const request = { key: cacheKey, id: ++requestIdRef.current }
		const generation = refreshGenerationRef.current
		inFlightRef.current = request
		setLoadingMoreKey(cacheKey)

		const fetchPromise = fetchPage(load.endCursor, Math.min(pageSize, remaining))
		let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = globalThis.setTimeout(() => reject(new Error(timeoutMessage)), LOAD_MORE_TIMEOUT_MS)
		})

		void Promise.race([fetchPromise, timeoutPromise])
			.then((page) => {
				if (generation !== refreshGenerationRef.current) return
				let persistedLoad: Load | null = null
				setLoadCache((current) => {
					const currentLoad = current[request.key]
					if (!currentLoad) return current
					persistedLoad = mergePage(currentLoad, page)
					return { ...current, [request.key]: persistedLoad }
				})
				if (persistedLoad) void Promise.resolve(persistLoad(persistedLoad)).catch(() => {})
			})
			.catch((error) => {
				flashNotice(errorMessage(error))
			})
			.finally(() => {
				if (timeoutId !== null) globalThis.clearTimeout(timeoutId)
				if (inFlightRef.current !== request) return
				inFlightRef.current = null
				setLoadingMoreKey((current) => (current === request.key ? null : current))
			})

		return true
	}

	const resetLoadingMore = () => {
		inFlightRef.current = null
		setLoadingMoreKey(null)
	}

	return { loadMore, isLoadingMore: loadingMoreKey === cacheKey, resetLoadingMore }
}
