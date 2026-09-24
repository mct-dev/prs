export type CommentLoadState =
	| { readonly status: "idle" }
	| { readonly status: "loading"; readonly cached: boolean }
	| { readonly status: "ready" }
	| { readonly status: "error"; readonly error: string; readonly cached: boolean }

export type StoredCommentLoadState = Exclude<CommentLoadState, { readonly status: "idle" }>

export const idleCommentLoadState: CommentLoadState = { status: "idle" }

export type CommentsPaneMode = "loading" | "comments" | "error"

export const commentsPaneMode = (state: CommentLoadState): CommentsPaneMode => {
	if (state.status === "ready") return "comments"
	if ((state.status === "loading" || state.status === "error") && state.cached) return "comments"
	return state.status === "error" ? "error" : "loading"
}

export const commentsHeaderStatus = (state: CommentLoadState, countText: string, loadingIndicator: string): string => {
	if (state.status === "loading") return `${loadingIndicator} loading`
	if (state.status === "error") return "! load failed"
	return countText
}
