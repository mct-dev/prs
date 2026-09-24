import type { ScrollBoxRenderable } from "@opentui/core"
import { useLayoutEffect, type MutableRefObject } from "react"
import { scrollTopForVisibleLine } from "./diff.js"

const DEFAULT_STICKY_HEADER = 2

/**
 * Scrolls a scrollbox to keep the selected line visible whenever it changes.
 * Pass `null` for selectedLine to skip (e.g., when the list is empty or no row
 * is highlighted). Uses useLayoutEffect so the scroll happens before paint —
 * otherwise the freshly-mounted scrollbox briefly flashes at scrollTop=0
 * (e.g. when switching back to a surface where the selected row is far down).
 * Retries via rAF if the scrollbox hasn't measured its viewport yet.
 */
export const useScrollFollowSelected = (
	scrollRef: MutableRefObject<ScrollBoxRenderable | null>,
	selectedLine: number | null,
	stickyHeader: number = DEFAULT_STICKY_HEADER,
): void => {
	useLayoutEffect(() => {
		const scroll = scrollRef.current
		if (!scroll || selectedLine === null) return
		let cancelled = false
		let attempts = 0
		const apply = () => {
			if (cancelled) return
			const viewportHeight = scroll.viewport.height
			if (viewportHeight <= 0) {
				if (attempts++ < 20) globalThis.setTimeout(apply, 16)
				return
			}
			const nextTop = scrollTopForVisibleLine(scroll.scrollTop, viewportHeight, selectedLine, stickyHeader)
			if (nextTop !== scroll.scrollTop) scroll.scrollTo({ x: 0, y: nextTop })
		}
		apply()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedLine])
}
