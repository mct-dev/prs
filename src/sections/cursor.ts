// Keyboard navigation across sections. The section cursor names the section
// that `[` / `]` / `z` act on. It can rest on a collapsed or empty section
// (whose header is then highlighted) while the PR selection stays elsewhere.
//
// The cursor stores the selection (url and visible row) that was current when
// it was set. As long as that is still the selection, the cursor wins; once the
// user moves the selection (j/k, click), the section holding the selected row
// takes over. With `exclusive: false` one PR can appear in several sections, so
// rows are resolved by section and offset, never by the url's first position.

export interface SectionNavGroup {
	readonly id: string
	readonly collapsed: boolean
	readonly urls: readonly string[]
}

/** The selected PR: its url and its row in the visible (flattened) list. */
export interface SectionSelection {
	readonly url: string
	readonly index: number
}

export interface SectionCursor {
	readonly id: string
	readonly url: string | null
	/** Visible row of `url` when the cursor was set; null with no selection. */
	readonly index: number | null
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

/** First visible row of each visible section. */
const visibleStarts = (groups: readonly SectionNavGroup[]) => {
	const starts = new Map<string, number>()
	let offset = 0
	for (const group of groups) {
		if (!isVisible(group)) continue
		starts.set(group.id, offset)
		offset += group.urls.length
	}
	return starts
}

/** The visible section holding the selected row; falls back to the url's first section if the row is out of date. */
const sectionOf = (groups: readonly SectionNavGroup[], selected: SectionSelection | null): SectionNavGroup | undefined => {
	if (!selected) return undefined
	const starts = visibleStarts(groups)
	const byRow = groups.find((group) => {
		const start = starts.get(group.id)
		return start !== undefined && group.urls[selected.index - start] === selected.url
	})
	return byRow ?? groups.find((group) => isVisible(group) && group.urls.includes(selected.url))
}

/** The section the selected row itself sits in (by row index, so a PR listed in two sections resolves to the right one). */
export const selectedRowSectionId = (groups: readonly SectionNavGroup[], selected: SectionSelection | null): string | null => sectionOf(groups, selected)?.id ?? null

const cursorMatches = (cursor: SectionCursor, selected: SectionSelection | null) =>
	cursor.url === (selected?.url ?? null) && (cursor.index === null || selected === null || cursor.index === selected.index)

const cursorAt = (id: string, selection: { readonly selectIndex: number | null; readonly selectUrl: string | null }): SectionCursor => ({
	id,
	url: selection.selectUrl,
	index: selection.selectUrl === null ? null : selection.selectIndex,
})

/** The section `z` / `[` / `]` act on. */
export const activeSectionId = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selected: SectionSelection | null): string | null => {
	if (cursor && cursorMatches(cursor, selected) && groups.some((group) => group.id === cursor.id)) return cursor.id
	const containing = sectionOf(groups, selected)
	if (containing) return containing.id
	if (cursor && groups.some((group) => group.id === cursor.id)) return cursor.id
	return groups[0]?.id ?? null
}

/** The header to highlight: the active section when the selected row is not visibly inside it. */
export const focusedSectionHeaderId = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selected: SectionSelection | null): string | null => {
	const id = activeSectionId(groups, cursor, selected)
	const group = groups.find((candidate) => candidate.id === id)
	if (!group) return null
	return sectionOf(groups, selected)?.id === group.id ? null : group.id
}

/** Select `url` inside section `id` of `groups`, by that section's first row plus the url's offset in it. */
const selectIn = (groups: readonly SectionNavGroup[], id: string | undefined, url: string | null) => {
	if (url === null) return { selectIndex: null, selectUrl: null }
	const group = groups.find((candidate) => candidate.id === id)
	const start = id === undefined ? undefined : visibleStarts(groups).get(id)
	const offset = group ? group.urls.indexOf(url) : -1
	if (start !== undefined && offset >= 0) return { selectIndex: start + offset, selectUrl: url }
	const index = visibleUrls(groups).indexOf(url)
	return index >= 0 ? { selectIndex: index, selectUrl: url } : { selectIndex: null, selectUrl: null }
}

/** `]` (delta 1) / `[` (delta -1): move to the next section, including collapsed and empty ones, wrapping. */
export const stepSection = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selected: SectionSelection | null, delta: 1 | -1): SectionNavResult | null => {
	if (groups.length === 0) return null
	const current = groups.findIndex((group) => group.id === activeSectionId(groups, cursor, selected))
	const target = groups[((((current < 0 ? 0 : current) + delta) % groups.length) + groups.length) % groups.length]!
	if (isVisible(target)) {
		const selection = selectIn(groups, target.id, target.urls[0]!)
		return { cursor: cursorAt(target.id, selection), ...selection }
	}
	return { cursor: { id: target.id, url: selected?.url ?? null, index: selected?.index ?? null }, selectIndex: null, selectUrl: selected?.url ?? null }
}

/** `z` or a header click: toggle one section. Collapsing moves the selection to the next visible section (or the previous one). */
export const toggleSectionAt = (
	groups: readonly SectionNavGroup[],
	cursor: SectionCursor | null,
	selected: SectionSelection | null,
	id: string | null = activeSectionId(groups, cursor, selected),
): SectionNavResult | null => {
	const index = groups.findIndex((group) => group.id === id)
	if (index < 0) return null
	const group = groups[index]!
	const collapsed = { [group.id]: !group.collapsed }
	const next = withCollapsed(groups, collapsed)
	const selectedSection = sectionOf(groups, selected)
	if (group.collapsed) {
		const selection = group.urls.length > 0 ? selectIn(next, group.id, group.urls[0]!) : selectIn(next, selectedSection?.id, selected?.url ?? null)
		return { cursor: cursorAt(group.id, selection), collapsed, ...selection }
	}
	const after = next.slice(index + 1).find(isVisible)
	const before = next.slice(0, index).reverse().find(isVisible)
	const selectedStillVisible = selectedSection !== undefined && selectedSection.id !== group.id
	const fallback = after ?? before
	const selection = selectedStillVisible ? selectIn(next, selectedSection.id, selected!.url) : selectIn(next, fallback?.id, fallback?.urls[0] ?? null)
	return { cursor: cursorAt(group.id, selection), collapsed, ...selection }
}

/** `Z`: collapse every section when any is open, otherwise expand them all. The cursor stays on the active section. */
export const toggleAllSectionsAt = (groups: readonly SectionNavGroup[], cursor: SectionCursor | null, selected: SectionSelection | null): SectionNavResult | null => {
	if (groups.length === 0) return null
	const id = activeSectionId(groups, cursor, selected)!
	const collapse = groups.some((group) => !group.collapsed)
	const collapsed = Object.fromEntries(groups.map((group) => [group.id, collapse]))
	if (collapse) return { cursor: { id, url: null, index: null }, collapsed, selectIndex: null, selectUrl: null }
	const next = withCollapsed(groups, collapsed)
	const target = next.find((group) => group.id === id && isVisible(group)) ?? next.find(isVisible)
	const selection = selectIn(next, target?.id, target?.urls[0] ?? null)
	return { cursor: cursorAt(id, selection), collapsed, ...selection }
}
