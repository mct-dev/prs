import type { PullRequestStateModalCtx } from "../pullRequestStateModal.ts"

export interface BuildPullRequestStateModalCtxInput {
	readonly closeActiveModal: () => void
	readonly confirmPullRequestStateChange: () => void
	readonly movePullRequestStateSelection: () => void
}

export const buildPullRequestStateModalCtx = ({
	closeActiveModal,
	confirmPullRequestStateChange,
	movePullRequestStateSelection,
}: BuildPullRequestStateModalCtxInput): PullRequestStateModalCtx => ({
	closeModal: closeActiveModal,
	confirmStateChange: confirmPullRequestStateChange,
	moveSelection: movePullRequestStateSelection,
})
