import type { WorkspaceSurface } from "../../workspaceSurfaces.ts"
import type { ListNavCtx } from "../listNav.ts"

export interface BuildListNavCtxInput {
	readonly halfPage: number
	readonly visibleCount: number
	readonly hasFilter: boolean
	readonly activeSurface: WorkspaceSurface
	readonly surfaces: readonly WorkspaceSurface[]
	readonly canGoUpWorkspace: boolean
	readonly canScrollDetailPreview: boolean
	readonly runCommandById: (id: string) => void
	readonly openSelection: () => void
	readonly openRepositoryPicker: () => void
	readonly toggleFavoriteRepository: () => void
	readonly removeSelectedRepository: () => void
	readonly openFilterModal: () => void
	readonly goUpWorkspace: () => void
	readonly switchQueueMode: (delta: 1 | -1) => void
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
	readonly scrollDetailPreviewBy: (delta: number) => void
	readonly scrollDetailPreviewTo: (line: number) => void
	readonly stepSelected: (delta: number) => void
	readonly stepSelectedUp: (count?: number) => void
	readonly stepSelectedDown: (count?: number) => void
	readonly stepSelectedUpWrap: () => void
	readonly stepSelectedDownWithLoadMore: () => void
	readonly moveSelectedToPreviousGroup: () => void
	readonly moveSelectedToNextGroup: () => void
	readonly setSelected: (index: number) => void
}

export const buildListNavCtx = (input: BuildListNavCtxInput): ListNavCtx => ({
	halfPage: input.halfPage,
	visibleCount: input.visibleCount,
	hasFilter: input.hasFilter,
	activeSurface: input.activeSurface,
	surfaces: input.surfaces,
	canGoUpWorkspace: input.canGoUpWorkspace,
	canScrollDetailPreview: input.canScrollDetailPreview,
	runCommandById: input.runCommandById,
	openSelection: input.openSelection,
	openRepositoryPicker: input.openRepositoryPicker,
	toggleFavoriteRepository: input.toggleFavoriteRepository,
	removeSelectedRepository: input.removeSelectedRepository,
	openFilterModal: input.openFilterModal,
	goUpWorkspace: input.goUpWorkspace,
	switchQueueMode: input.switchQueueMode,
	switchWorkspaceSurface: input.switchWorkspaceSurface,
	cycleWorkspaceSurface: input.cycleWorkspaceSurface,
	scrollDetailPreviewBy: input.scrollDetailPreviewBy,
	scrollDetailPreviewTo: input.scrollDetailPreviewTo,
	clearFilter: () => input.runCommandById("filter.clear"),
	stepSelected: input.stepSelected,
	stepSelectedUp: input.stepSelectedUp,
	stepSelectedDown: input.stepSelectedDown,
	stepSelectedUpWrap: input.stepSelectedUpWrap,
	stepSelectedDownWithLoadMore: input.stepSelectedDownWithLoadMore,
	moveSelectedToPreviousGroup: input.moveSelectedToPreviousGroup,
	moveSelectedToNextGroup: input.moveSelectedToNextGroup,
	setSelected: input.setSelected,
})
