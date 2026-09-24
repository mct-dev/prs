import { describe, expect, test } from "bun:test"
import {
	activeSectionId,
	focusedSectionHeaderId,
	type SectionCursor,
	type SectionNavGroup,
	type SectionNavResult,
	type SectionSelection,
	selectedRowSectionId,
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

// The selection at a url's first visible row.
const at = (current: readonly SectionNavGroup[], url: string): SectionSelection => ({
	url,
	index: current.flatMap((group) => (!group.collapsed ? group.urls : [])).indexOf(url),
})

// Apply a nav result the way the surface hook does and return the new state.
const apply = (current: readonly SectionNavGroup[], selected: SectionSelection | null, result: SectionNavResult | null) => {
	if (!result) throw new Error("expected a nav result")
	const next = current.map((group) => (result.collapsed && group.id in result.collapsed ? { ...group, collapsed: result.collapsed[group.id]! } : group))
	const selection = result.selectIndex !== null && result.selectUrl !== null ? { url: result.selectUrl, index: result.selectIndex } : result.selectIndex === null ? selected : null
	return { groups: next, cursor: result.cursor as SectionCursor | null, selected: selection, selectedUrl: selection?.url ?? null }
}

describe("section cursor", () => {
	test("z collapses the selected section, then z again re-expands the same section", () => {
		let state = { groups, cursor: null as SectionCursor | null, selected: at(groups, "a2") as SectionSelection | null, selectedUrl: "a2" as string | null }
		state = apply(state.groups, state.selected, toggleSectionAt(state.groups, state.cursor, state.selected))
		expect(state.groups.find((group) => group.id === "a")!.collapsed).toBe(true)
		expect(state.selectedUrl).toBe("b1")
		expect(activeSectionId(state.groups, state.cursor, state.selected)).toBe("a")
		expect(focusedSectionHeaderId(state.groups, state.cursor, state.selected)).toBe("a")

		state = apply(state.groups, state.selected, toggleSectionAt(state.groups, state.cursor, state.selected))
		expect(state.groups.every((group) => !group.collapsed)).toBe(true)
		expect(state.selectedUrl).toBe("a1")
		expect(focusedSectionHeaderId(state.groups, state.cursor, state.selected)).toBeNull()
	})

	test("collapsing the last visible section falls back to the previous section", () => {
		const result = toggleSectionAt(groups, null, at(groups, "c2"))!
		expect(result.collapsed).toEqual({ c: true })
		expect(result.selectUrl).toBe("b1")
		expect(result.selectIndex).toBe(2)
	})

	test("collapsing a section other than the selection keeps the selection", () => {
		const result = toggleSectionAt(groups, null, at(groups, "a1"), "c")!
		expect(result.selectUrl).toBe("a1")
		expect(result.selectIndex).toBe(0)
	})

	test("moving the selection after a collapse hands control back to the selected PR's section", () => {
		const collapsed = apply(groups, at(groups, "a1"), toggleSectionAt(groups, null, at(groups, "a1")))
		expect(activeSectionId(collapsed.groups, collapsed.cursor, at(collapsed.groups, "c1"))).toBe("c")
	})

	test("Z collapses everything, then Z expands everything and restores a selection", () => {
		let state = { groups, cursor: null as SectionCursor | null, selected: at(groups, "b1") as SectionSelection | null, selectedUrl: "b1" as string | null }
		state = apply(state.groups, state.selected, toggleAllSectionsAt(state.groups, state.cursor, state.selected))
		expect(state.groups.every((group) => group.collapsed)).toBe(true)
		expect(state.cursor).toEqual({ id: "b", url: null, index: null })

		state = apply(state.groups, null, toggleAllSectionsAt(state.groups, state.cursor, null))
		expect(state.groups.every((group) => !group.collapsed)).toBe(true)
		expect(state.selectedUrl).toBe("b1")
	})

	test("] and [ visit collapsed and empty sections and wrap", () => {
		const withCollapsed = groups.map((group) => (group.id === "b" ? { ...group, collapsed: true } : group))
		let state = { groups: withCollapsed, cursor: null as SectionCursor | null, selected: at(withCollapsed, "a1") as SectionSelection | null, selectedUrl: "a1" as string | null }
		const visited: string[] = []
		for (let step = 0; step < 4; step++) {
			state = apply(state.groups, state.selected, stepSection(state.groups, state.cursor, state.selected, 1))
			visited.push(activeSectionId(state.groups, state.cursor, state.selected)!)
		}
		expect(visited).toEqual(["b", "empty", "c", "a"])

		// On the collapsed section, z expands it and selects its first PR.
		state = apply(state.groups, state.selected, stepSection(state.groups, state.cursor, state.selected, -1))
		state = apply(state.groups, state.selected, stepSection(state.groups, state.cursor, state.selected, -1))
		state = apply(state.groups, state.selected, stepSection(state.groups, state.cursor, state.selected, -1))
		expect(activeSectionId(state.groups, state.cursor, state.selected)).toBe("b")
		expect(state.selectedUrl).toBe("c1")
		state = apply(state.groups, state.selected, toggleSectionAt(state.groups, state.cursor, state.selected))
		expect(state.groups.find((group) => group.id === "b")!.collapsed).toBe(false)
		expect(state.selectedUrl).toBe("b1")
	})

	describe("a PR shown in two sections (exclusive: false)", () => {
		const shared: readonly SectionNavGroup[] = [
			{ id: "mine", collapsed: false, urls: ["x", "y"] },
			{ id: "team", collapsed: false, urls: ["x", "z"] },
		]

		test("the selected row, not the url's first copy, names the active section", () => {
			const second = { url: "x", index: 2 }
			expect(activeSectionId(shared, null, second)).toBe("team")
			expect(focusedSectionHeaderId(shared, null, second)).toBeNull()
			expect(activeSectionId(shared, null, { url: "x", index: 0 })).toBe("mine")
		})

		test("] lands on the later section's copy and keeps walking", () => {
			const toTeam = stepSection(shared, null, { url: "x", index: 0 }, 1)!
			expect(toTeam.selectIndex).toBe(2)
			expect(toTeam.cursor).toEqual({ id: "team", url: "x", index: 2 })
			const selected = { url: "x", index: 2 }
			expect(activeSectionId(shared, toTeam.cursor, selected)).toBe("team")
			const back = stepSection(shared, toTeam.cursor, selected, 1)!
			expect(back.cursor.id).toBe("mine")
			expect(back.selectIndex).toBe(0)
		})

		test("a cursor set on one copy does not claim the other copy", () => {
			const cursor = { id: "team", url: "x", index: 2 }
			expect(activeSectionId(shared, cursor, { url: "x", index: 0 })).toBe("mine")
		})

		test("collapsing the other section keeps the selected copy, at its new row", () => {
			const result = toggleSectionAt(shared, null, { url: "x", index: 2 }, "mine")!
			expect(result.collapsed).toEqual({ mine: true })
			expect(result.selectUrl).toBe("x")
			expect(result.selectIndex).toBe(0)
		})
	})
})

describe("selectedRowSectionId", () => {
	// "dup" is listed in both sections (exclusive: false).
	const dupGroups: readonly SectionNavGroup[] = [
		{ id: "a", collapsed: false, urls: ["a1", "dup"] },
		{ id: "b", collapsed: false, urls: ["dup", "b1"] },
	]

	test("a duplicate row resolves to the section its row index is in", () => {
		expect(selectedRowSectionId(dupGroups, { url: "dup", index: 1 })).toBe("a")
		expect(selectedRowSectionId(dupGroups, { url: "dup", index: 2 })).toBe("b")
	})

	test("ignores the header cursor", () => {
		const cursor: SectionCursor = { id: "b", url: "a1", index: 0 }
		expect(activeSectionId(dupGroups, cursor, { url: "a1", index: 0 })).toBe("b")
		expect(selectedRowSectionId(dupGroups, { url: "a1", index: 0 })).toBe("a")
	})
})
