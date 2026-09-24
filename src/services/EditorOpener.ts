import { Context, Effect, Layer } from "effect"
import type { PullRequestItem } from "../domain.js"
import { commandNeedsRepoPath, type EditorCommandFields, renderEditorCommand, resolveRepoPath } from "../editorCommand.js"
import { loadStoredEditorConfig } from "../themeStore.js"
import { withTuiSuspended } from "../tuiSuspension.js"
import { CommandError } from "./CommandRunner.js"

const pullRequestFields = (pr: PullRequestItem): EditorCommandFields => ({
	repository: pr.repository,
	number: pr.number,
	headRef: pr.headRefName,
	baseRef: pr.baseRefName,
	author: pr.author,
	url: pr.url,
})

// When no editorCommand is configured, fall back to $VISUAL/$EDITOR opening the
// resolved repo path. This keeps `e` useful out of the box for anyone with a
// repoPaths mapping, while the README documents richer diffview/octo recipes.
const fallbackCommand = (repoPath: string | null): string | null => {
	const editor = (process.env.VISUAL || process.env.EDITOR || "").trim()
	if (!editor || !repoPath) return null
	return `${editor} ${repoPath}`
}

const editorError = (detail: string, cause?: unknown) => new CommandError({ command: "editor", args: [], detail, cause: cause ?? detail })

const runInShell = async (command: string): Promise<void> => {
	const shell = process.env.SHELL || "/bin/sh"
	const proc = Bun.spawn({
		cmd: [shell, "-c", command],
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	})
	const exitCode = await proc.exited
	if (exitCode !== 0) throw new Error(`Editor command exited with code ${exitCode}`)
}

export class EditorOpener extends Context.Service<
	EditorOpener,
	{
		readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, CommandError>
	}
>()("ghui/EditorOpener") {
	static readonly layerNoDeps = Layer.effect(
		EditorOpener,
		Effect.gen(function* () {
			const openPullRequest = Effect.fn("EditorOpener.openPullRequest")(function* (pullRequest: PullRequestItem) {
				const { editorCommand, repoPaths } = yield* loadStoredEditorConfig
				const repoPath = resolveRepoPath(repoPaths, pullRequest.repository)
				const fields = pullRequestFields(pullRequest)

				const template = editorCommand ?? fallbackCommand(repoPath)
				if (!template) {
					return yield* editorError(editorCommand ? "No editor command configured" : "Set $EDITOR, or add editorCommand / repoPaths to config.json")
				}

				if (commandNeedsRepoPath(template) && repoPath === null) {
					return yield* editorError(`No repoPaths entry matched ${pullRequest.repository}; add one in config.json`)
				}

				const command = renderEditorCommand(template, fields, repoPath)
				yield* Effect.tryPromise({
					try: () => withTuiSuspended(() => runInShell(command)),
					catch: (cause) => editorError(cause instanceof Error ? cause.message : "Failed to launch editor", cause),
				})
			})

			return EditorOpener.of({ openPullRequest })
		}),
	)

	static readonly layer = EditorOpener.layerNoDeps

	// Headless no-op for mock mode / tests.
	static readonly mockLayer = Layer.succeed(
		EditorOpener,
		EditorOpener.of({
			openPullRequest: () => Effect.void,
		}),
	)
}
