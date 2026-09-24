import { describe, expect, test } from "bun:test"
import type { IssueItem, PullRequestComment } from "../src/domain.js"
import { useCommentsLoader } from "../src/hooks/useCommentsLoader.js"
import { commentsHeaderStatus, commentsPaneMode, type StoredCommentLoadState } from "../src/ui/comments/loadState.js"

const issue = { repository: "owner/repo", number: 42 } as IssueItem
const key = "issue:owner/repo#42"

const deferred = <A>() => {
	let resolve!: (value: A) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<A>((onResolve, onReject) => {
		resolve = onResolve
		reject = onReject
	})
	return { promise, resolve, reject }
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("comments load state", () => {
	test("retains an uncached loading failure as a persistent error", async () => {
		let states: Record<string, StoredCommentLoadState> = {}
		let comments: Record<string, readonly PullRequestComment[]> = {}
		const request = deferred<readonly PullRequestComment[]>()
		const notices: string[] = []
		const loader = useCommentsLoader({
			refreshGenerationRef: { current: 0 },
			readCommentsLoadState: () => states,
			setPullRequestComments: (update) => {
				comments = update(comments)
			},
			setPullRequestCommentsLoaded: (update) => {
				states = update(states)
			},
			listPullRequestComments: async () => [],
			listIssueComments: () => request.promise,
			flashNotice: (message) => notices.push(message),
		})

		loader.loadIssueComments(issue)
		expect(states[key]).toEqual({ status: "loading", cached: false })

		request.reject(new Error("GitHub unavailable"))
		await flushPromises()

		expect(states[key]).toEqual({ status: "error", error: "GitHub unavailable", cached: false })
		expect(notices).toEqual(["GitHub unavailable"])
	})

	test("keeps cached comments while a forced refresh loads and fails", async () => {
		const cachedComment = { id: "cached" } as PullRequestComment
		let states: Record<string, StoredCommentLoadState> = { [key]: { status: "ready" } }
		let comments: Record<string, readonly PullRequestComment[]> = { [key]: [cachedComment] }
		const request = deferred<readonly PullRequestComment[]>()
		const loader = useCommentsLoader({
			refreshGenerationRef: { current: 0 },
			readCommentsLoadState: () => states,
			setPullRequestComments: (update) => {
				comments = update(comments)
			},
			setPullRequestCommentsLoaded: (update) => {
				states = update(states)
			},
			listPullRequestComments: async () => [],
			listIssueComments: () => request.promise,
			flashNotice: () => {},
		})

		loader.loadIssueComments(issue, true)
		expect(states[key]).toEqual({ status: "loading", cached: true })
		expect(comments[key]).toEqual([cachedComment])

		request.reject(new Error("refresh failed"))
		await flushPromises()

		expect(states[key]).toEqual({ status: "error", error: "refresh failed", cached: true })
		expect(comments[key]).toEqual([cachedComment])
	})

	test("selects centered loading only for uncached loads", () => {
		expect(commentsPaneMode({ status: "idle" })).toBe("loading")
		expect(commentsPaneMode({ status: "loading", cached: false })).toBe("loading")
		expect(commentsPaneMode({ status: "loading", cached: true })).toBe("comments")
		expect(commentsPaneMode({ status: "error", error: "nope", cached: false })).toBe("error")
		expect(commentsPaneMode({ status: "error", error: "nope", cached: true })).toBe("comments")
	})

	test("uses the header loading indicator during cached refresh", () => {
		expect(commentsHeaderStatus({ status: "loading", cached: true }, "2 comments", "◐")).toBe("◐ loading")
		expect(commentsHeaderStatus({ status: "ready" }, "2 comments", "◐")).toBe("2 comments")
		expect(commentsHeaderStatus({ status: "error", error: "nope", cached: true }, "2 comments", "◐")).toBe("! load failed")
	})
})
