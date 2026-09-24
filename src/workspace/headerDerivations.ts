import { fitCell } from "../ui/primitives.js"

export interface HeaderDerivations {
	readonly headerRight: string
	readonly headerLeftWidth: number
	readonly footerNotice: string | null
	readonly homeCrumb: string
	readonly breadcrumbSeparator: string
	readonly breadcrumbSeparatorText: string
	readonly headerRepoWidth: number
}

/**
 * Pure header/footer text math:
 *   - `@username` chip on the right,
 *   - the truncated notice string (or null),
 *   - the breadcrumb separator + repo slot widths used by `WorkspaceHeader`.
 */
export const computeHeaderDerivations = (input: {
	readonly username: string | null
	readonly notice: string | null
	readonly headerFooterWidth: number
	readonly selectedRepository: string | null
}): HeaderDerivations => {
	const { username, notice, headerFooterWidth, selectedRepository } = input
	const headerRight = username ? `@${username}` : ""
	const headerLeftWidth = Math.max(0, headerFooterWidth - headerRight.length)
	const footerNotice = notice ? fitCell(notice, headerFooterWidth) : null
	const homeCrumb = "HOME"
	const breadcrumbSeparator = "/"
	const breadcrumbSeparatorText = ` ${breadcrumbSeparator} `
	const headerRepoWidth = selectedRepository ? Math.max(0, headerLeftWidth - homeCrumb.length - breadcrumbSeparatorText.length) : 0
	return { headerRight, headerLeftWidth, footerNotice, homeCrumb, breadcrumbSeparator, breadcrumbSeparatorText, headerRepoWidth }
}

/**
 * Binary search over the sorted `groupStarts` index list. Used to map
 * a selection index back to its PR group so j/k can hop to the next
 * group's first row.
 */
export const groupIndexAt = (groupStarts: readonly number[], current: number): number => {
	if (groupStarts.length === 0) return 0
	let low = 0
	let high = groupStarts.length - 1
	while (low < high) {
		const mid = (low + high + 1) >>> 1
		if (groupStarts[mid]! <= current) low = mid
		else high = mid - 1
	}
	return low
}

/**
 * Move `current` by `delta` rows without leaving its group: the result is
 * clamped to the group's first and last row, so j/k never cross into (or wrap
 * around to) another group. `total` is the number of rows across all groups.
 */
export const stepWithinGroup = (groupStarts: readonly number[], total: number, current: number, delta: number): number => {
	if (total <= 0) return 0
	const clamped = Math.max(0, Math.min(total - 1, current))
	const group = groupIndexAt(groupStarts, clamped)
	const first = groupStarts[group] ?? 0
	const last = (groupStarts[group + 1] ?? total) - 1
	return Math.max(first, Math.min(last, clamped + delta))
}
