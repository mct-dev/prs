import { context } from "@prs/keymap"

export interface FilterModeCtx {
	readonly cancel: () => void
	readonly commit: () => void
	/** The autocomplete popover has rows showing. */
	readonly popoverOpen: boolean
	/** The user moved onto a row with ↑↓ / Tab, so Enter accepts it. */
	readonly popoverPicked: boolean
	readonly movePopover: (delta: number) => void
	readonly acceptSuggestion: () => void
	readonly dismissPopover: () => void
}

const Filter = context<FilterModeCtx>()

export const filterModeKeymap = Filter(
	{ id: "filter-mode.cancel", title: "Cancel filter", keys: ["escape"], run: (s) => (s.popoverOpen ? s.dismissPopover() : s.cancel()) },
	{ id: "filter-mode.commit", title: "Apply filter", keys: ["return"], run: (s) => (s.popoverPicked ? s.acceptSuggestion() : s.commit()) },
	{ id: "filter-mode.complete", title: "Complete", keys: ["tab"], run: (s) => s.acceptSuggestion() },
	{ id: "filter-mode.suggestion-up", title: "Previous suggestion", keys: ["up", "shift+tab"], run: (s) => s.movePopover(-1) },
	{ id: "filter-mode.suggestion-down", title: "Next suggestion", keys: ["down"], run: (s) => s.movePopover(1) },
)
