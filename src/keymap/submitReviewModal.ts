import { context } from "@ghui/keymap"

export interface SubmitReviewModalCtx {
	readonly summaryFocused: boolean
	readonly handleEscape: () => void
	readonly submit: () => void
	readonly focusSummary: () => void
	readonly insertNewline: () => void
	readonly moveActionSelection: (delta: -1 | 1) => void
	readonly moveLeft: () => void
	readonly moveRight: () => void
	readonly moveUp: () => void
	readonly moveDown: () => void
	readonly moveLineStart: () => void
	readonly moveLineEnd: () => void
	readonly moveWordBackward: () => void
	readonly moveWordForward: () => void
	readonly backspace: () => void
	readonly deleteForward: () => void
	readonly deleteWordBackward: () => void
	readonly deleteWordForward: () => void
	readonly deleteToLineStart: () => void
	readonly deleteToLineEnd: () => void
}

const SubmitReview = context<SubmitReviewModalCtx>()

export const submitReviewModalKeymap = SubmitReview(
	{ id: "submit-review.escape", title: "Back / cancel", keys: ["escape"], run: (s) => s.handleEscape() },
	{ id: "submit-review.focus-summary", title: "Edit summary", keys: ["return"], when: (s) => !s.summaryFocused, run: (s) => s.focusSummary() },
	{ id: "submit-review.submit", title: "Submit", keys: ["return"], when: (s) => s.summaryFocused, run: (s) => s.submit() },
	{ id: "submit-review.newline", title: "Insert newline", keys: ["shift+return"], when: (s) => s.summaryFocused, run: (s) => s.insertNewline() },
	{ id: "submit-review.next-action", title: "Next action", keys: ["down", "j"], when: (s) => !s.summaryFocused, run: (s) => s.moveActionSelection(1) },
	{ id: "submit-review.previous-action", title: "Previous action", keys: ["up", "k"], when: (s) => !s.summaryFocused, run: (s) => s.moveActionSelection(-1) },

	{ id: "submit-review.move-left", title: "Cursor left", keys: ["left", "ctrl+b"], when: (s) => s.summaryFocused, run: (s) => s.moveLeft() },
	{ id: "submit-review.move-right", title: "Cursor right", keys: ["right", "ctrl+f"], when: (s) => s.summaryFocused, run: (s) => s.moveRight() },
	{ id: "submit-review.move-up", title: "Cursor up", keys: ["up"], when: (s) => s.summaryFocused, run: (s) => s.moveUp() },
	{ id: "submit-review.move-down", title: "Cursor down", keys: ["down"], when: (s) => s.summaryFocused, run: (s) => s.moveDown() },
	{ id: "submit-review.line-start", title: "Line start", keys: ["home", "ctrl+a"], when: (s) => s.summaryFocused, run: (s) => s.moveLineStart() },
	{ id: "submit-review.line-end", title: "Line end", keys: ["end", "ctrl+e"], when: (s) => s.summaryFocused, run: (s) => s.moveLineEnd() },
	{ id: "submit-review.word-back", title: "Word backward", keys: ["meta+b", "meta+left"], when: (s) => s.summaryFocused, run: (s) => s.moveWordBackward() },
	{ id: "submit-review.word-forward", title: "Word forward", keys: ["meta+f", "meta+right"], when: (s) => s.summaryFocused, run: (s) => s.moveWordForward() },

	{ id: "submit-review.backspace", title: "Backspace", keys: ["backspace"], when: (s) => s.summaryFocused, run: (s) => s.backspace() },
	{ id: "submit-review.delete", title: "Delete", keys: ["delete", "ctrl+d"], when: (s) => s.summaryFocused, run: (s) => s.deleteForward() },
	{ id: "submit-review.delete-word-back", title: "Delete word backward", keys: ["ctrl+w", "meta+backspace"], when: (s) => s.summaryFocused, run: (s) => s.deleteWordBackward() },
	{ id: "submit-review.delete-word-forward", title: "Delete word forward", keys: ["meta+delete"], when: (s) => s.summaryFocused, run: (s) => s.deleteWordForward() },
	{ id: "submit-review.delete-to-line-start", title: "Delete to line start", keys: ["ctrl+u"], when: (s) => s.summaryFocused, run: (s) => s.deleteToLineStart() },
	{ id: "submit-review.delete-to-line-end", title: "Delete to line end", keys: ["ctrl+k"], when: (s) => s.summaryFocused, run: (s) => s.deleteToLineEnd() },
)
