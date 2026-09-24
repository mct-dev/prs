import { filterThemeDefinitions } from "../../ui/colors.ts"
import type { ThemeModalState } from "../../ui/modals.ts"
import type { ThemeModalCtx } from "../themeModal.ts"

export interface BuildThemeModalCtxInput {
	readonly themeModal: ThemeModalState
	readonly closeThemeModal: (confirm: boolean) => void
	readonly updateThemeQuery: (query: string, options?: { readonly previewFirst?: boolean; readonly filterMode?: boolean }) => void
	readonly toggleThemeMode: () => void
	readonly toggleThemeTone: () => void
	readonly moveThemeSelection: (delta: -1 | 1) => void
}

export const buildThemeModalCtx = ({
	themeModal,
	closeThemeModal,
	updateThemeQuery,
	toggleThemeMode,
	toggleThemeTone,
	moveThemeSelection,
}: BuildThemeModalCtxInput): ThemeModalCtx => ({
	filterMode: themeModal.filterMode,
	hasFilteredResults: filterThemeDefinitions(themeModal.query, themeModal.tone).length > 0,
	closeWithoutSaving: () => closeThemeModal(false),
	clearFilter: () => updateThemeQuery("", { filterMode: false }),
	enterFilterMode: () => updateThemeQuery("", { filterMode: true }),
	toggleMode: toggleThemeMode,
	toggleTone: toggleThemeTone,
	confirmSelection: () => closeThemeModal(true),
	moveSelection: moveThemeSelection,
})
