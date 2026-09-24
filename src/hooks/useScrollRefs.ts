import type { ScrollBoxRenderable } from "@opentui/core"
import { useRef, type MutableRefObject } from "react"

export interface ScrollRefs {
	readonly detailScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly detailPreviewScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly diffScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly prListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly issueListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly prListScrollPersistedRef: MutableRefObject<number>
	readonly issueListScrollPersistedRef: MutableRefObject<number>
	readonly suppressNextDiffCommentScrollRef: MutableRefObject<boolean>
}

/**
 * Allocates the scroll/persistence refs the surfaces share. Detail
 * preview intentionally resets per selection — persisting it would
 * surprise users who expect new content to start at the top.
 *
 * Returns them in a single record so App.tsx threads one ref bundle
 * through instead of eight separate `useRef` lines.
 */
export const useScrollRefs = (): ScrollRefs => {
	const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const detailPreviewScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const prListScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const issueListScrollRef = useRef<ScrollBoxRenderable | null>(null)
	const prListScrollPersistedRef = useRef(0)
	const issueListScrollPersistedRef = useRef(0)
	const suppressNextDiffCommentScrollRef = useRef(false)
	return {
		detailScrollRef,
		detailPreviewScrollRef,
		diffScrollRef,
		prListScrollRef,
		issueListScrollRef,
		prListScrollPersistedRef,
		issueListScrollPersistedRef,
		suppressNextDiffCommentScrollRef,
	}
}
