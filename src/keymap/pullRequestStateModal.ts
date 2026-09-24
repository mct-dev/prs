import { context } from "@ghui/keymap"
import { selectionModalBindings } from "./helpers.js"

export interface PullRequestStateModalCtx {
	readonly closeModal: () => void
	readonly confirmStateChange: () => void
	readonly moveSelection: (delta: 1 | -1) => void
}

const PullRequestState = context<PullRequestStateModalCtx>()

export const pullRequestStateModalKeymap = PullRequestState(
	...selectionModalBindings<PullRequestStateModalCtx>({
		id: "pull-state",
		cancelTitle: "Cancel state change",
		close: (s) => s.closeModal(),
		confirm: { title: "Apply state change", run: (s) => s.confirmStateChange() },
		move: (s, delta) => s.moveSelection(delta),
		verticalKeys: { up: ["up", "k"], down: ["down", "j"] },
	}),
)
