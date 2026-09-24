import { describe, expect, test } from "bun:test"
import {
	activeSectionId,
	focusedSectionHeaderId,
	type SectionCursor,
	type SectionNavGroup,
	type SectionNavResult,
	stepSection,
	toggleAllSectionsAt,
	toggleSectionAt,
} from "../src/sections/cursor.js"

const groups: readonly SectionNavGroup[] = [
	{ id: "a", collapsed: false, urls: ["a1", "a2"] },
	{ id: "b", collapsed: false, urls: ["b1"] },
	{ id: "empty", collapsed: false, urls: [] },
	{ id: "c", collapsed: false, urls: ["c1", "c2"] },
]

// Apply a nav result the way the surface hook does and return the new state.
const apply = (current: readonly SectionNavGroup[], selectedUrl: string | null, result: SectionNavResult | null) => {
	if (!result) throw new Error("expected a nav result")
	const next = current.map((group) => (result.collapsed && group.id in result.collapsed ? { ...group, collapsed: result.collapsed[group.id]! } : group))
	return { groups: next, cursor: result.cursor as SectionCursor | null, selectedUrl: result.selectUrl ?? (result.selectIndex === null ? selectedUrl : null) }
}

describe("section cursor", () => {
	test("z collapses the selected section, then z again re-expands the same section", () => {
		let state = { groups, cursor: null as SectionCursor | null, selectedUrl: "a2" as string | null }
		state = apply(state.groups, state.selectedUrl, toggleSectionAt(state.groups, state.cursor, state.selectedUrl))
		expect(state.groups.find((group) => group.id === "a")!.collapsed).toBe(true)
		expect(state.selectedUrl).toBe("b1")
		expect(activeSectionId(state.groups, state.cursor, state.selectedUrl)).toBe("a")
		expect(focusedSectionHeaderId(state.groups, state.cursor, state.selectedUrl)).toBe("a")

		state = apply(state.groups, state.selectedUrl, toggleSectionAt(state.groups, state.cursor, state.selectedUrl))
		expect(state.groups.every((group) => !group.collapsed)).toBe(true)
		expect(state.selectedUrl).toBe("a1")
		expect(focusedSectionHeaderId(state.groups, state.cursor, state.selectedUrl)).toBeNull()
	})

	test("collapsing the last visible section falls back to the previous section", () => {
		const result = toggleSectionAt(groups, null, "c2")!
		expect(result.collapsed).toEqual({ c: true })
		expect(result.selectUrl).toBe("b1")
		expect(result.selectIndex).toBe(2)
	})

	test("collapsing a section other than the selection keeps the selection", () => {
		const result = toggleSectionAt(groups, null, "a1", "c")!
		expect(result.selectUrl).toBe("a1")
		expect(result.selectIndex).toBe(0)
	})

	test("moving the selection after a collapse hands control back to the selected PR's section", () => {
		const collapsed = apply(groups, "a1", toggleSectionAt(groups, null, "a1"))
		expect(activeSectionId(collapsed.groups, collapsed.cursor, "c1")).toBe("c")
	})

	test("Z collapses everything, then Z expands everything and restores a selection", () => {
		let state = { groups, cursor: null as SectionCursor | null, selectedUrl: "b1" as string | null }
		state = apply(state.groups, state.selectedUrl, toggleAllSectionsAt(state.groups, state.cursor, state.selectedUrl))
		expect(state.groups.every((group) => group.collapsed)).toBe(true)
		expect(state.cursor).toEqual({ id: "b", url: null })

		state = apply(state.groups, null, toggleAllSectionsAt(state.groups, state.cursor, null))
		expect(state.groups.every((group) => !group.collapsed)).toBe(true)
		expect(state.selectedUrl).toBe("b1")
	})

	test("] and [ visit collapsed and empty sections and wrap", () => {
		const withCollapsed = groups.map((group) => (group.id === "b" ? { ...group, collapsed: true } : group))
		let state = { groups: withCollapsed, cursor: null as SectionCursor | null, selectedUrl: "a1" as string | null }
		const visited: string[] = []
		for (let step = 0; step < 4; step++) {
			state = apply(state.groups, state.selectedUrl, stepSection(state.groups, state.cursor, state.selectedUrl, 1))
			visited.push(activeSectionId(state.groups, state.cursor, state.selectedUrl)!)
		}
		expect(visited).toEqual(["b", "empty", "c", "a"])

		// On the collapsed section, z expands it and selects its first PR.
		state = apply(state.groups, state.selectedUrl, stepSection(state.groups, state.cursor, state.selectedUrl, -1))
		state = apply(state.groups, state.selectedUrl, stepSection(state.groups, state.cursor, state.selectedUrl, -1))
		state = apply(state.groups, state.selectedUrl, stepSection(state.groups, state.cursor, state.selectedUrl, -1))
		expect(activeSectionId(state.groups, state.cursor, state.selectedUrl)).toBe("b")
		expect(state.selectedUrl).toBe("c1")
		state = apply(state.groups, state.selectedUrl, toggleSectionAt(state.groups, state.cursor, state.selectedUrl))
		expect(state.groups.find((group) => group.id === "b")!.collapsed).toBe(false)
		expect(state.selectedUrl).toBe("b1")
	})
})
