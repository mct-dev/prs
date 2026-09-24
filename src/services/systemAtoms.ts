import type { PullRequestItem, SubmitPullRequestReviewInput } from "../domain.js"
import { BrowserOpener } from "./BrowserOpener.js"
import { Clipboard } from "./Clipboard.js"
import { EditorOpener } from "./EditorOpener.js"
import { GitHubService } from "./GitHubService.js"
import { githubRuntime } from "./runtime.js"

export const submitPullRequestReviewAtom = githubRuntime.fn<SubmitPullRequestReviewInput>()((input) => GitHubService.use((github) => github.submitPullRequestReview(input)))
export const copyToClipboardAtom = githubRuntime.fn<string>()((text) => Clipboard.use((clipboard) => clipboard.copy(text)))
export const openInBrowserAtom = githubRuntime.fn<PullRequestItem>()((pullRequest) => BrowserOpener.use((browser) => browser.openPullRequest(pullRequest)))
export const openUrlAtom = githubRuntime.fn<string>()((url) => BrowserOpener.use((browser) => browser.openUrl(url)))
export const openInEditorAtom = githubRuntime.fn<PullRequestItem>()((pullRequest) => EditorOpener.use((editor) => editor.openPullRequest(pullRequest)))
