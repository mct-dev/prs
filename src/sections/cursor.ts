// Keyboard navigation across sections. The section cursor names the section
// that `[` / `]` / `z` act on. It can rest on a collapsed or empty section
// (whose header is then highlighted) while the PR selection stays elsewhere.
//
// The cursor stores the PR url that was selected when it was set. As long as
// that url is still the selection, the cursor wins; once the user moves the
// selection (j/k, click), the section containing the selected PR takes over.

export interface SectionNavGroup {
	readonly id: string
	readonly collapsed: boolean
	readonly urls: readonly string[]
}

export interface SectionCursor {
	readonly id: string
	readonly url: string | null
}

export interface SectionNavResult {
	readonly cursor: SectionCursor
	/** Collapsed state to write for the touched sections, if any. */
	readonly collapsed?: Readonly<Record<string, boolean>>
	/** New PR selection as an index into the post-change visible list; null keeps the current index. */
	readonly selectIndex: number | null
	/** Url at `selectIndex`, or null when nothing visible is selected. */
	readonly selectUrl: string | null
}

const isVisible = (group: SectionNavGroup) => !group.collapsed && group.urls.length > 0

const visibleUrls = (groups: readonly SectionNavGroup[]) => groups.flatMap((group) => (isVisible(group) ? group.urls : []))

const withCollapsed = (groups: readonly SectionNavGroup[], patch: Readonly<Record<string, boolean>>) =>
	groups.map((group) => (group.id in patch ? { ...group, collapsed: patch[group.id]! } : group))

/** The section `z` / `[` / `]` act on. */
export const activeSectionId = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selectedUrl: string | null): string | null => {
	if (cursor && cursor.url === selectedUrl && groups.some((group) => group.id === cursor.id)) return cursor.id
	const containing = selectedUrl ? groups.find((group) => isVisible(group) && group.urls.includes(selectedUrl)) : undefined
	if (containing) return containing.id
	if (cursor && groups.some((group) => group.id === cursor.id)) return cursor.id
	return groups[0]?.id ?? null
}

/** The header to highlight: the active section when the selected PR is not visibly inside it. */
export const focusedSectionHeaderId = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selectedUrl: string | null): string | null => {
	const id = activeSectionId(groups, cursor, selectedUrl)
	const group = groups.find((candidate) => candidate.id === id)
	if (!group) return null
	return isVisible(group) && selectedUrl !== null && group.urls.includes(selectedUrl) ? null : group.id
}

const select = (groups: readonly SectionNavGroup[], url: string | null) => {
	if (url === null) return { selectIndex: null, selectUrl: null }
	const index = visibleUrls(groups).indexOf(url)
	return index >= 0 ? { selectIndex: index, selectUrl: url } : { selectIndex: null, selectUrl: null }
}

/** `]` (delta 1) / `[` (delta -1): move to the next section, including collapsed and empty ones, wrapping. */
export const stepSection = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selectedUrl: string | null, delta: 1 | -1): SectionNavResult | null => {
	if (groups.length === 0) return null
	const current = groups.findIndex((group) => group.id === activeSectionId(groups, cursor, selectedUrl))
	const target = groups[((((current < 0 ? 0 : current) + delta) % groups.length) + groups.length) % groups.length]!
	if (isVisible(target)) return { cursor: { id: target.id, url: target.urls[0]! }, ...select(groups, target.urls[0]!) }
	return { cursor: { id: target.id, url: selectedUrl }, selectIndex: null, selectUrl: selectedUrl }
}

/** `z` or a header click: toggle one section. Collapsing moves the selection to the next visible section (or the previous one). */
export const toggleSectionAt = (
	groups: readonly SectionNavGroup[],
	cursor: SectionCursor | null,
	selectedUrl: string | null,
	id: string | null = activeSectionId(groups, cursor, selectedUrl),
): SectionNavResult | null => {
	const index = groups.findIndex((group) => group.id === id)
	if (index < 0) return null
	const group = groups[index]!
	const collapsed = { [group.id]: !group.collapsed }
	const next = withCollapsed(groups, collapsed)
	if (group.collapsed) {
		const url = group.urls[0] ?? selectedUrl
		const selection = select(next, url)
		return { cursor: { id: group.id, url: selection.selectUrl }, collapsed, ...selection }
	}
	const after = next.slice(index + 1).find(isVisible)
	const before = next.slice(0, index).reverse().find(isVisible)
	const selectedStillVisible = selectedUrl !== null && !group.urls.includes(selectedUrl) && visibleUrls(next).includes(selectedUrl)
	const url = selectedStillVisible ? selectedUrl : ((after ?? before)?.urls[0] ?? null)
	const selection = select(next, url)
	return { cursor: { id: group.id, url: selection.selectUrl }, collapsed, ...selection }
}

/** `Z`: collapse every section when any is open, otherwise expand them all. The cursor stays on the active section. */
export const toggleAllSectionsAt = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selectedUrl: string | null): SectionNavResult | null => {
	if (groups.length === 0) return null
	const id = activeSectionId(groups, cursor, selectedUrl)!
	const collapse = groups.some((group) => !group.collapsed)
	const collapsed = Object.fromEntries(groups.map((group) => [group.id, collapse]))
	if (collapse) return { cursor: { id, url: null }, collapsed, selectIndex: null, selectUrl: null }
	const next = withCollapsed(groups, collapsed)
	const url = next.find((group) => group.id === id && isVisible(group))?.urls[0] ?? next.find(isVisible)?.urls[0] ?? null
	const selection = select(next, url)
	return { cursor: { id, url: selection.selectUrl }, collapsed, ...selection }
}
