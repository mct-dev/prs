import { context } from "@ghui/keymap"
import { changedFilesModalKeymap, type ChangedFilesModalCtx } from "./changedFilesModal.ts"
import { closeModalKeymap, type CloseModalCtx } from "./closeModal.ts"
import { commandPaletteKeymap, type CommandPaletteCtx } from "./commandPalette.ts"
import { commentModalKeymap, type CommentModalCtx } from "./commentModal.ts"
import { commentsViewKeymap, type CommentsViewCtx } from "./commentsView.ts"
import { commentThreadModalKeymap, type CommentThreadModalCtx } from "./commentThreadModal.ts"
import { deleteCommentModalKeymap, type DeleteCommentModalCtx } from "./deleteCommentModal.ts"
import { detailViewKeymap, type DetailViewCtx } from "./detailView.ts"
import { diffViewKeymap, type DiffViewCtx } from "./diffView.ts"
import { filterModalKeymap, type FilterModalCtx } from "./filterModal.ts"
import { filterModeKeymap, type FilterModeCtx } from "./filterMode.ts"
import { labelModalKeymap, type LabelModalCtx } from "./labelModal.ts"
import { listNavKeymap, type ListNavCtx } from "./listNav.ts"
import { mergeModalKeymap, type MergeModalCtx } from "./mergeModal.ts"
import { openRepositoryModalKeymap, type OpenRepositoryModalCtx } from "./openRepositoryModal.ts"
import { pullRequestStateModalKeymap, type PullRequestStateModalCtx } from "./pullRequestStateModal.ts"
import { reviewPresetModalKeymap, type ReviewPresetModalCtx } from "./reviewPresetModal.ts"
import { runsViewKeymap, type RunsViewCtx } from "./runsView.ts"
import { briefViewKeymap, type BriefViewCtx } from "./briefView.ts"
import { submitReviewModalKeymap, type SubmitReviewModalCtx } from "./submitReviewModal.ts"
import { themeModalKeymap, type ThemeModalCtx } from "./themeModal.ts"

export interface AppCtx {
	// Active flags
	readonly closeModalActive: boolean
	readonly pullRequestStateModalActive: boolean
	readonly mergeModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly filterModalActive: boolean
	readonly reviewPresetModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly labelModalActive: boolean
	readonly themeModalActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly commentModalActive: boolean
	readonly deleteCommentModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly legendModalActive: boolean
	readonly filterMode: boolean
	readonly diffFullView: boolean
	readonly runsFullView: boolean
	readonly briefFullView: boolean
	readonly detailFullView: boolean
	readonly commentsViewActive: boolean

	// True whenever a modal/mode swallows raw text input (so q-quit, etc. are
	// disabled inside text-editing contexts).
	readonly textInputActive: boolean

	// Per-layer narrow contexts
	readonly closeModal: CloseModalCtx
	readonly pullRequestStateModal: PullRequestStateModalCtx
	readonly mergeModal: MergeModalCtx
	readonly commentThreadModal: CommentThreadModalCtx
	readonly changedFilesModal: ChangedFilesModalCtx
	readonly filterModal: FilterModalCtx
	readonly reviewPresetModal: ReviewPresetModalCtx
	readonly submitReviewModal: SubmitReviewModalCtx
	readonly labelModal: LabelModalCtx
	readonly themeModal: ThemeModalCtx
	readonly openRepositoryModal: OpenRepositoryModalCtx
	readonly commentModal: CommentModalCtx
	readonly deleteCommentModal: DeleteCommentModalCtx
	readonly commandPalette: CommandPaletteCtx
	readonly filterModeCtx: FilterModeCtx
	readonly diff: DiffViewCtx
	readonly runs: RunsViewCtx
	readonly brief: BriefViewCtx
	readonly detail: DetailViewCtx
	readonly commentsView: CommentsViewCtx
	readonly listNav: ListNavCtx

	// Always-on / app-level
	readonly openCommandPalette: () => void
	readonly openLegend: () => void
	readonly closeLegend: () => void
	readonly handleQuitOrClose: () => void
}

const App = context<AppCtx>()

const modalActive = (a: AppCtx): boolean =>
	a.closeModalActive ||
	a.pullRequestStateModalActive ||
	a.mergeModalActive ||
	a.commentThreadModalActive ||
	a.changedFilesModalActive ||
	a.filterModalActive ||
	a.reviewPresetModalActive ||
	a.submitReviewModalActive ||
	a.labelModalActive ||
	a.themeModalActive ||
	a.openRepositoryModalActive ||
	a.commentModalActive ||
	a.deleteCommentModalActive ||
	a.commandPaletteActive ||
	a.legendModalActive

const inListMode = (a: AppCtx): boolean => !modalActive(a) && !a.filterMode && !a.diffFullView && !a.runsFullView && !a.briefFullView && !a.detailFullView && !a.commentsViewActive

export const appKeymap = App(
	// Always-on: command palette opener
	{ id: "command.open", title: "Open command palette", keys: ["ctrl+p", "meta+k"], run: (s) => s.openCommandPalette() },
	{ id: "legend.open", title: "Show icon legend", keys: ["?"], when: (s) => !s.textInputActive && !s.legendModalActive, run: (s) => s.openLegend() },
	{ id: "legend.close", title: "Close legend", keys: ["escape", "?", "return"], when: (s) => s.legendModalActive, run: (s) => s.closeLegend() },

	// Quit / close-active-modal — gated to "not editing text"
	{
		id: "app.quit-or-close",
		title: "Quit / close modal",
		keys: ["ctrl+c"],
		run: (s) => s.handleQuitOrClose(),
	},
	{
		id: "app.quit-or-close-q",
		title: "Quit / close modal",
		keys: ["q"],
		when: (s) => !s.textInputActive,
		run: (s) => s.handleQuitOrClose(),
	},

	// Modal layers
	closeModalKeymap.scope((a) => a.closeModalActive && a.closeModal),
	pullRequestStateModalKeymap.scope((a) => a.pullRequestStateModalActive && a.pullRequestStateModal),
	mergeModalKeymap.scope((a) => a.mergeModalActive && a.mergeModal),
	commentThreadModalKeymap.scope((a) => a.commentThreadModalActive && a.commentThreadModal),
	changedFilesModalKeymap.scope((a) => a.changedFilesModalActive && a.changedFilesModal),
	filterModalKeymap.scope((a) => a.filterModalActive && a.filterModal),
	reviewPresetModalKeymap.scope((a) => a.reviewPresetModalActive && a.reviewPresetModal),
	submitReviewModalKeymap.scope((a) => a.submitReviewModalActive && a.submitReviewModal),
	labelModalKeymap.scope((a) => a.labelModalActive && a.labelModal),
	themeModalKeymap.scope((a) => a.themeModalActive && a.themeModal),
	openRepositoryModalKeymap.scope((a) => a.openRepositoryModalActive && a.openRepositoryModal),
	commentModalKeymap.scope((a) => a.commentModalActive && a.commentModal),
	deleteCommentModalKeymap.scope((a) => a.deleteCommentModalActive && a.deleteCommentModal),
	commandPaletteKeymap.scope((a) => a.commandPaletteActive && a.commandPalette),
	filterModeKeymap.scope((a) => a.filterMode && a.filterModeCtx),

	// Full-view layers (only when no modal is on top)
	diffViewKeymap.scope((a) => a.diffFullView && !modalActive(a) && a.diff),
	runsViewKeymap.scope((a) => a.runsFullView && !modalActive(a) && a.runs),
	briefViewKeymap.scope((a) => a.briefFullView && !modalActive(a) && a.brief),
	detailViewKeymap.scope((a) => a.detailFullView && !modalActive(a) && a.detail),
	commentsViewKeymap.scope((a) => a.commentsViewActive && !modalActive(a) && a.commentsView),

	// PR list nav
	listNavKeymap.scope((a) => inListMode(a) && a.listNav),
)
