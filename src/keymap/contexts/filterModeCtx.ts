import type { FilterModeCtx } from "../filterMode.ts"

export interface FilterPopoverControls {
	readonly open: boolean
	readonly picked: boolean
	readonly move: (delta: number) => void
	readonly accept: () => void
	readonly dismiss: () => void
}

export interface BuildFilterModeCtxInput {
	readonly cancelFilter: () => void
	readonly commitFilter: () => void
	readonly popover: FilterPopoverControls
}

export const buildFilterModeCtx = ({ cancelFilter, commitFilter, popover }: BuildFilterModeCtxInput): FilterModeCtx => ({
	cancel: cancelFilter,
	commit: commitFilter,
	popoverOpen: popover.open,
	popoverPicked: popover.picked,
	movePopover: popover.move,
	acceptSuggestion: popover.accept,
	dismissPopover: popover.dismiss,
})
