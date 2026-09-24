import { useAtom } from "@effect/atom-react"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { Modal, type ModalState, type ModalTag } from "../ui/modals/types.js"
import {
	initialChangedFilesModalState,
	initialCloseModalState,
	initialCommandPaletteState,
	initialCommentModalState,
	initialDeleteCommentModalState,
	initialFilterModalState,
	initialLabelModalState,
	initialMergeModalState,
	initialModal,
	initialOpenRepositoryModalState,
	initialPullRequestStateModalState,
	initialSubmitReviewModalState,
	initialThemeModalState,
	type ChangedFilesModalState,
	type CloseModalState,
	type CommandPaletteState,
	type CommentModalState,
	type DeleteCommentModalState,
	type FilterModalState,
	type LabelModalState,
	type MergeModalState,
	type OpenRepositoryModalState,
	type PullRequestStateModalState,
	type SubmitReviewModalState,
	type ThemeModalState,
} from "../ui/modals/types.js"

export interface ModalStack {
	readonly activeModal: Modal
	readonly closeActiveModal: () => void
	readonly labelModalActive: boolean
	readonly closeModalActive: boolean
	readonly pullRequestStateModalActive: boolean
	readonly mergeModalActive: boolean
	readonly commentModalActive: boolean
	readonly deleteCommentModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly filterModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly themeModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly labelModal: LabelModalState
	readonly closeModal: CloseModalState
	readonly pullRequestStateModal: PullRequestStateModalState
	readonly mergeModal: MergeModalState
	readonly commentModal: CommentModalState
	readonly deleteCommentModal: DeleteCommentModalState
	readonly changedFilesModal: ChangedFilesModalState
	readonly filterModal: FilterModalState
	readonly submitReviewModal: SubmitReviewModalState
	readonly themeModal: ThemeModalState
	readonly commandPalette: CommandPaletteState
	readonly openRepositoryModal: OpenRepositoryModalState
	readonly setLabelModal: ReturnType<typeof makeModalSetter<"Label">>
	readonly setPullRequestStateModal: ReturnType<typeof makeModalSetter<"PullRequestState">>
	readonly setMergeModal: ReturnType<typeof makeModalSetter<"Merge">>
	readonly setCommentModal: ReturnType<typeof makeModalSetter<"Comment">>
	readonly setDeleteCommentModal: ReturnType<typeof makeModalSetter<"DeleteComment">>
	readonly setCommentThreadModal: ReturnType<typeof makeModalSetter<"CommentThread">>
	readonly setChangedFilesModal: ReturnType<typeof makeModalSetter<"ChangedFiles">>
	readonly setFilterModal: ReturnType<typeof makeModalSetter<"Filter">>
	readonly setSubmitReviewModal: ReturnType<typeof makeModalSetter<"SubmitReview">>
	readonly setThemeModal: ReturnType<typeof makeModalSetter<"Theme">>
	readonly setCommandPalette: ReturnType<typeof makeModalSetter<"CommandPalette">>
	readonly setOpenRepositoryModal: ReturnType<typeof makeModalSetter<"OpenRepository">>
}

type ModalSetter = (current: Modal) => Modal

const makeModalSetter =
	<Tag extends Exclude<ModalTag, "None">>(setActiveModal: (next: Modal | ModalSetter) => void, tag: Tag) =>
	(next: ModalState<Tag> | ((prev: ModalState<Tag>) => ModalState<Tag>)) =>
		setActiveModal((current) => {
			const ctor = Modal[tag] as unknown as (args: ModalState<Tag>) => Modal
			if (typeof next === "function") {
				const updater = next as (prev: ModalState<Tag>) => ModalState<Tag>
				if (current._tag !== tag) return current
				return ctor(updater(current as unknown as ModalState<Tag>))
			}
			return ctor(next)
		})

/**
 * Subscribes to `activeModalAtom` and derives the cross-cutting state
 * each modal needs: an active boolean, a typed snapshot (or its initial
 * default), and a tag-narrowed setter. Centralising the boilerplate
 * here keeps App.tsx free of ~48 lines of mechanical destructuring.
 */
export const useModalStack = (): ModalStack => {
	const [activeModal, setActiveModal] = useAtom(activeModalAtom)
	const closeActiveModal = () => setActiveModal(initialModal)
	const labelModalActive = Modal.$is("Label")(activeModal)
	const closeModalActive = Modal.$is("Close")(activeModal)
	const pullRequestStateModalActive = Modal.$is("PullRequestState")(activeModal)
	const mergeModalActive = Modal.$is("Merge")(activeModal)
	const commentModalActive = Modal.$is("Comment")(activeModal)
	const deleteCommentModalActive = Modal.$is("DeleteComment")(activeModal)
	const commentThreadModalActive = Modal.$is("CommentThread")(activeModal)
	const changedFilesModalActive = Modal.$is("ChangedFiles")(activeModal)
	const filterModalActive = Modal.$is("Filter")(activeModal)
	const submitReviewModalActive = Modal.$is("SubmitReview")(activeModal)
	const themeModalActive = Modal.$is("Theme")(activeModal)
	const commandPaletteActive = Modal.$is("CommandPalette")(activeModal)
	const openRepositoryModalActive = Modal.$is("OpenRepository")(activeModal)
	return {
		activeModal,
		closeActiveModal,
		labelModalActive,
		closeModalActive,
		pullRequestStateModalActive,
		mergeModalActive,
		commentModalActive,
		deleteCommentModalActive,
		commentThreadModalActive,
		changedFilesModalActive,
		filterModalActive,
		submitReviewModalActive,
		themeModalActive,
		commandPaletteActive,
		openRepositoryModalActive,
		labelModal: labelModalActive ? activeModal : initialLabelModalState,
		closeModal: closeModalActive ? activeModal : initialCloseModalState,
		pullRequestStateModal: pullRequestStateModalActive ? activeModal : initialPullRequestStateModalState,
		mergeModal: mergeModalActive ? activeModal : initialMergeModalState,
		commentModal: commentModalActive ? activeModal : initialCommentModalState,
		deleteCommentModal: deleteCommentModalActive ? activeModal : initialDeleteCommentModalState,
		changedFilesModal: changedFilesModalActive ? activeModal : initialChangedFilesModalState,
		filterModal: filterModalActive ? activeModal : initialFilterModalState,
		submitReviewModal: submitReviewModalActive ? activeModal : initialSubmitReviewModalState,
		themeModal: themeModalActive ? activeModal : initialThemeModalState,
		commandPalette: commandPaletteActive ? activeModal : initialCommandPaletteState,
		openRepositoryModal: openRepositoryModalActive ? activeModal : initialOpenRepositoryModalState,
		setLabelModal: makeModalSetter(setActiveModal, "Label"),
		setPullRequestStateModal: makeModalSetter(setActiveModal, "PullRequestState"),
		setMergeModal: makeModalSetter(setActiveModal, "Merge"),
		setCommentModal: makeModalSetter(setActiveModal, "Comment"),
		setDeleteCommentModal: makeModalSetter(setActiveModal, "DeleteComment"),
		setCommentThreadModal: makeModalSetter(setActiveModal, "CommentThread"),
		setChangedFilesModal: makeModalSetter(setActiveModal, "ChangedFiles"),
		setFilterModal: makeModalSetter(setActiveModal, "Filter"),
		setSubmitReviewModal: makeModalSetter(setActiveModal, "SubmitReview"),
		setThemeModal: makeModalSetter(setActiveModal, "Theme"),
		setCommandPalette: makeModalSetter(setActiveModal, "CommandPalette"),
		setOpenRepositoryModal: makeModalSetter(setActiveModal, "OpenRepository"),
	}
}
