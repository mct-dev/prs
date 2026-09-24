import type {
	CommandPaletteState,
	FilterModalState,
	OpenRepositoryModalState,
	ThemeModalState,
	ChangedFilesModalState,
	LabelModalState,
	SubmitReviewModalState,
} from "../ui/modals/types.js"
import { insertText, type CommentEditorValue } from "../ui/commentEditor.js"
import { singleLineText } from "../ui/singleLineInput.js"
import { usePasteHandler } from "../ui/usePasteHandler.js"

export interface UsePasteRouterInput {
	readonly renderer: { readonly keyInput: unknown }
	readonly commandPaletteActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly themeModalActive: boolean
	readonly themeModal: ThemeModalState
	readonly commentModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly labelModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly filterMode: boolean
	readonly setCommandPalette: (next: (prev: CommandPaletteState) => CommandPaletteState) => void
	readonly setOpenRepositoryModal: (next: OpenRepositoryModalState | ((prev: OpenRepositoryModalState) => OpenRepositoryModalState)) => void
	readonly editThemeQuery: (transform: (query: string) => string) => void
	readonly setSubmitReviewModal: (next: (prev: SubmitReviewModalState) => SubmitReviewModalState) => void
	readonly setLabelModal: (next: (prev: LabelModalState) => LabelModalState) => void
	readonly setChangedFilesModal: (next: (prev: ChangedFilesModalState) => ChangedFilesModalState) => void
	readonly setFilterDraft: (next: (prev: string) => string) => void
}

/**
 * Routes the renderer's paste event to whichever input the user is
 * currently in. Each modal/input owns its own paste handler; this
 * hook is the dispatcher that picks the right one based on which
 * modal is open, returning `false` only when paste isn't relevant
 * (e.g. the in-modal comment editor handles its own paste).
 */
export const usePasteRouter = ({
	renderer,
	commandPaletteActive,
	openRepositoryModalActive,
	themeModalActive,
	themeModal,
	commentModalActive,
	submitReviewModalActive,
	labelModalActive,
	changedFilesModalActive,
	filterMode,
	setCommandPalette,
	setOpenRepositoryModal,
	editThemeQuery,
	setSubmitReviewModal,
	setLabelModal,
	setChangedFilesModal,
	setFilterDraft,
}: UsePasteRouterInput): void => {
	const insertPastedText = (text: string): boolean => {
		if (text.length === 0) return false
		if (commandPaletteActive) {
			setCommandPalette((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (openRepositoryModalActive) {
			setOpenRepositoryModal((current) => ({ ...current, query: current.query + singleLineText(text), error: null }))
			return true
		}
		if (themeModalActive && themeModal.filterMode) {
			editThemeQuery((query) => query + singleLineText(text))
			return true
		}
		if (commentModalActive) return false
		if (submitReviewModalActive) {
			setSubmitReviewModal((current) => {
				const next = insertText({ body: current.body, cursor: current.cursor }, text.replace(/\r\n?/g, "\n"))
				return { ...current, focus: "body", body: next.body, cursor: next.cursor, error: null }
			})
			return true
		}
		if (labelModalActive) {
			setLabelModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (changedFilesModalActive) {
			setChangedFilesModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (filterMode) {
			setFilterDraft((current) => current + singleLineText(text))
			return true
		}
		return false
	}

	usePasteHandler({ renderer, onPaste: insertPastedText })
}

// Type re-export so callers don't have to import from commentEditor.
export type { CommentEditorValue, FilterModalState }
