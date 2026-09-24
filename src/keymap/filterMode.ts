import { context } from "@ghui/keymap"

export interface FilterModeCtx {
	readonly cancel: () => void
	readonly commit: () => void
}

const Filter = context<FilterModeCtx>()

export const filterModeKeymap = Filter(
	{ id: "filter-mode.cancel", title: "Cancel filter", keys: ["escape"], run: (s) => s.cancel() },
	{ id: "filter-mode.commit", title: "Apply filter", keys: ["return"], run: (s) => s.commit() },
)
