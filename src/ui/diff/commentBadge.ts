import type { PullRequestReviewComment } from "../../domain.js"

// "◆3": review threads on a file. Empty when the file has none.
export const diffCommentBadge = (count: number) => (count > 0 ? `◆${count}` : "")

// Review threads per file path for one diff. `threads` is keyed like
// `diffCommentThreadsAtom` (`diffKey:path:side:line`).
export const diffThreadCounts = (diffKey: string | null, threads: Record<string, readonly PullRequestReviewComment[]>): ReadonlyMap<string, number> => {
	const counts = new Map<string, number>()
	if (!diffKey) return counts
	const prefix = `${diffKey}:`
	for (const [key, comments] of Object.entries(threads)) {
		const path = comments[0]?.path
		if (!key.startsWith(prefix) || !path) continue
		counts.set(path, (counts.get(path) ?? 0) + 1)
	}
	return counts
}
