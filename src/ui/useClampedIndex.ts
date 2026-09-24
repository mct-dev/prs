import { useEffect } from "react"

/**
 * Clamps an index atom/state to the valid range whenever the underlying
 * list length changes. Resets to 0 if the list is empty.
 */
export const useClampedIndex = (length: number, setIndex: (updater: (current: number) => number) => void): void => {
	useEffect(() => {
		setIndex((current) => {
			if (length === 0) return 0
			return Math.max(0, Math.min(current, length - 1))
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [length])
}
