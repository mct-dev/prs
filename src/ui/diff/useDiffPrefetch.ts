import { useEffect } from "react"
import type { PullRequestItem } from "../../domain.js"

const DEFAULT_DELAY_MS = 250

export interface UseDiffPrefetchInput {
	readonly pullRequest: PullRequestItem | null
	readonly skip: boolean
	readonly onPrefetch: (pullRequest: PullRequestItem) => void
	readonly delayMs?: number
}

/**
 * Schedules a delayed diff prefetch for the selected pull request, cancelling
 * any pending prefetch when selection changes or the skip flag flips.
 */
export const useDiffPrefetch = ({ pullRequest, skip, onPrefetch, delayMs = DEFAULT_DELAY_MS }: UseDiffPrefetchInput): void => {
	useEffect(() => {
		if (skip || !pullRequest) return
		const target = pullRequest
		const timeout = globalThis.setTimeout(() => onPrefetch(target), delayMs)
		return () => globalThis.clearTimeout(timeout)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pullRequest?.url, skip])
}
