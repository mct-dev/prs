import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { useContext } from "react"
import type { FilterPopoverControls } from "../../keymap/contexts/filterModeCtx.js"
import { filterDraftAtom } from "./atoms.js"
import { filterPopoverAtom, filterPopoverStateAtom, recentFiltersAtom, rememberFilter } from "./popover.js"

/** Key handlers for the `/` autocomplete popover; reads atoms at call time. */
export const useFilterPopoverControls = (): FilterPopoverControls & { readonly remember: (query: string) => void } => {
	const registry = useContext(RegistryContext)
	const view = useAtomValue(filterPopoverAtom)
	const items = view.suggestions.items
	return {
		open: items.length > 0,
		picked: view.index !== null,
		move: (delta) => {
			const current = registry.get(filterPopoverAtom)
			const count = current.suggestions.items.length
			if (count === 0) return
			const index = current.index === null ? (delta > 0 ? 0 : count - 1) : (current.index + delta + count) % count
			registry.set(filterPopoverStateAtom, { forDraft: registry.get(filterDraftAtom), index, dismissed: false })
		},
		accept: () => {
			const current = registry.get(filterPopoverAtom)
			const item = current.suggestions.items[current.index ?? 0]
			if (!item) return
			registry.set(filterDraftAtom, item.insert)
		},
		dismiss: () => {
			registry.set(filterPopoverStateAtom, { forDraft: registry.get(filterDraftAtom), index: null, dismissed: true })
		},
		remember: (query) => {
			registry.set(recentFiltersAtom, rememberFilter(registry.get(recentFiltersAtom), query))
		},
	}
}
