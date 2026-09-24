import type { FilterModeCtx } from "../filterMode.ts"

export interface BuildFilterModeCtxInput {
	readonly cancelFilter: () => void
	readonly commitFilter: () => void
}

export const buildFilterModeCtx = ({ cancelFilter, commitFilter }: BuildFilterModeCtxInput): FilterModeCtx => ({
	cancel: cancelFilter,
	commit: commitFilter,
})
