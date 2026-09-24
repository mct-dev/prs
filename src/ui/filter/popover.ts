import * as Atom from "effect/unstable/reactivity/Atom"
import { pushRecentFilter, readRecentFilters, writeRecentFilters } from "../../filter/recent.js"
import { filterDiagnostics, type FilterSuggestions, suggestFilter } from "../../filter/suggest.js"
import { mockPrCount } from "../../services/runtime.js"
import { displayedPullRequestsAtom, sectionStatesAtom } from "../pullRequests/atoms.js"
import { filterDraftAtom, filterModeAtom } from "./atoms.js"

// Mock/demo runs never touch the real recents file.
const persistRecents = mockPrCount === null

export const recentFiltersAtom = Atom.make<readonly string[]>(persistRecents ? readRecentFilters() : []).pipe(Atom.keepAlive)

/**
 * Highlight + dismissal for the `/` popover. Tagged with the draft it was set
 * for, so any edit to the draft resets it (no highlight, popover open again).
 */
export interface FilterPopoverState {
	readonly forDraft: string
	readonly index: number | null
	readonly dismissed: boolean
}

export const filterPopoverStateAtom = Atom.make<FilterPopoverState>({ forDraft: "", index: null, dismissed: false })

const sectionIdsAtom = Atom.make((get) => get(sectionStatesAtom).map((section) => section.id))

export const filterSuggestionsAtom = Atom.make(
	(get): FilterSuggestions =>
		suggestFilter({
			draft: get(filterDraftAtom),
			pullRequests: get(displayedPullRequestsAtom),
			recent: get(recentFiltersAtom),
			sectionIds: get(sectionIdsAtom),
		}),
)

export interface FilterPopoverView {
	readonly open: boolean
	readonly suggestions: FilterSuggestions
	/** Highlighted row, or null until the user moves with ↑↓ / Tab. */
	readonly index: number | null
	readonly warnings: readonly string[]
	/** Esc closed the popover for this draft. */
	readonly dismissed: boolean
}

export const filterPopoverAtom = Atom.make((get): FilterPopoverView => {
	const draft = get(filterDraftAtom)
	const suggestions = get(filterSuggestionsAtom)
	const state = get(filterPopoverStateAtom)
	const current = state.forDraft === draft ? state : { index: null, dismissed: false }
	const index = current.index !== null && current.index < suggestions.items.length ? current.index : null
	return {
		open: get(filterModeAtom),
		suggestions: current.dismissed ? { token: suggestions.token, items: [] } : suggestions,
		index: current.dismissed ? null : index,
		dismissed: current.dismissed,
		warnings: filterDiagnostics(draft, { sectionIds: get(sectionIdsAtom), skipCurrent: suggestions.items.length > 0 }),
	}
})

export const rememberFilter = (recent: readonly string[], query: string): readonly string[] => {
	const next = pushRecentFilter(recent, query)
	if (persistRecents && next !== recent) writeRecentFilters(next)
	return next
}
