import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect } from "effect"
import type { PullRequestItem } from "../domain.js"
import { type RepoPaths, resolveRepoPath } from "../editorCommand.js"
import type { ReviewMode } from "./prompt.js"
import { type RunLog, runChecked, runLogged } from "./process.js"

export type WorkspacePullRequest = Pick<
	PullRequestItem,
	"repository" | "number" | "headRefOid" | "headRefName" | "baseRefName" | "title" | "body" | "url" | "author" | "additions" | "deletions" | "changedFiles"
>

export interface PreparedWorkspace {
	readonly mode: ReviewMode
	readonly cwd: string
	/** The commit actually checked out (normally the PR's headRefOid). */
	readonly headSha: string
	readonly mergeBase: string | null
	readonly files: readonly string[]
	readonly cleanup: Effect.Effect<void>
}

export interface PrepareWorkspaceOptions {
	readonly pullRequest: WorkspacePullRequest
	readonly presetId: string
	readonly repoPaths: RepoPaths
	readonly worktreesDir: string
	/** Parent directory for diff-only temp dirs. */
	readonly tempDir: string
	readonly log: RunLog | null
	readonly gitTimeoutMs?: number
	readonly ghCommand?: string
}

const DEFAULT_GIT_TIMEOUT_MS = 5 * 60_000

const safeSegment = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-")

export const worktreeDirName = (repository: string, number: number, sha: string, presetId: string) => {
	const [owner = "owner", repo = "repo"] = repository.split("/")
	return [owner, repo, String(number), sha.slice(0, 7), presetId].map(safeSegment).join("-")
}

/** Pick the remote whose URL points at owner/repo on GitHub; fall back to origin. */
export const pickRemote = (remoteOutput: string, repository: string): string => {
	const wanted = repository.toLowerCase()
	for (const line of remoteOutput.split("\n")) {
		const [name, url] = line.trim().split(/\s+/)
		if (!name || !url) continue
		const match = /github\.com[:/](.+?)(?:\.git)?\/?$/i.exec(url)
		if (match?.[1]?.toLowerCase() === wanted) return name
	}
	return "origin"
}

/** File paths from `diff --git a/x b/y` headers of a unified diff. */
export const filesFromDiff = (diff: string): readonly string[] => {
	const files = new Set<string>()
	for (const line of diff.split("\n")) {
		const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
		if (match?.[2]) files.add(match[2])
	}
	return [...files]
}

const nonEmptyLines = (text: string) =>
	text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)

const isGitRepo = (path: string, options: { timeoutMs: number; log: RunLog | null }) =>
	runLogged({ command: "git", args: ["-C", path, "rev-parse", "--git-dir"], cwd: path }, options).pipe(
		Effect.map((result) => result.exitCode === 0),
		Effect.orElseSucceed(() => false),
	)

const prepareWorktree = Effect.fn("review.prepareWorktree")(function* (clone: string, options: PrepareWorkspaceOptions) {
	const { pullRequest: pr, log } = options
	const run = { timeoutMs: options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS, log }
	const git = (...args: string[]) => runChecked({ command: "git", args: ["-C", clone, ...args], cwd: clone }, run)
	const gitOk = (...args: string[]) =>
		runLogged({ command: "git", args: ["-C", clone, ...args], cwd: clone }, run).pipe(
			Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)),
			Effect.orElseSucceed(() => null),
		)

	const remote = pickRemote((yield* gitOk("remote", "-v")) ?? "", pr.repository)
	yield* git("fetch", "--no-tags", remote, `pull/${pr.number}/head`)
	const hasHead = (yield* gitOk("cat-file", "-e", `${pr.headRefOid}^{commit}`)) !== null
	const headSha = hasHead ? pr.headRefOid : (yield* git("rev-parse", "FETCH_HEAD")).stdout.trim()

	let mergeBase: string | null = null
	if ((yield* gitOk("fetch", "--no-tags", remote, pr.baseRefName)) !== null) {
		mergeBase = yield* gitOk("merge-base", headSha, "FETCH_HEAD")
	}

	yield* Effect.promise(() => mkdir(options.worktreesDir, { recursive: true }))
	const path = join(options.worktreesDir, worktreeDirName(pr.repository, pr.number, headSha, options.presetId))
	const cleanup = git("worktree", "remove", "--force", path).pipe(
		Effect.catch(() => Effect.promise(() => rm(path, { recursive: true, force: true })).pipe(Effect.andThen(gitOk("worktree", "prune")))),
		Effect.asVoid,
	)

	const existingHead = existsSync(path)
		? yield* runLogged({ command: "git", args: ["-C", path, "rev-parse", "HEAD"], cwd: path }, run).pipe(
				Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)),
				Effect.orElseSucceed(() => null),
			)
		: null
	if (existingHead !== headSha) {
		if (existsSync(path)) yield* cleanup
		// Disable hooks: the checkout is untrusted PR code.
		yield* git("-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", path, headSha)
	} else {
		log?.write(`reusing worktree ${path}\n`)
	}

	const files = mergeBase ? nonEmptyLines((yield* gitOk("diff", "--name-only", `${mergeBase}..${headSha}`)) ?? "") : []
	return { mode: "worktree", cwd: path, headSha, mergeBase, files, cleanup } satisfies PreparedWorkspace
})

const prepareDiffOnly = Effect.fn("review.prepareDiffOnly")(function* (options: PrepareWorkspaceOptions) {
	const { pullRequest: pr, log } = options
	yield* Effect.promise(() => mkdir(options.tempDir, { recursive: true }))
	const dir = yield* Effect.promise(() => mkdtemp(join(options.tempDir, `${worktreeDirName(pr.repository, pr.number, pr.headRefOid, options.presetId)}-`)))
	const cleanup = Effect.promise(() => rm(dir, { recursive: true, force: true }))
	const diff = yield* runChecked(
		{ command: options.ghCommand ?? "gh", args: ["pr", "diff", String(pr.number), "-R", pr.repository], cwd: dir },
		{ timeoutMs: options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS, log },
	).pipe(Effect.tapError(() => cleanup))
	const metadata = {
		repository: pr.repository,
		number: pr.number,
		title: pr.title,
		body: pr.body,
		url: pr.url,
		author: pr.author,
		baseRefName: pr.baseRefName,
		headRefName: pr.headRefName,
		headRefOid: pr.headRefOid,
		additions: pr.additions,
		deletions: pr.deletions,
		changedFiles: pr.changedFiles,
	}
	yield* Effect.promise(() => Promise.all([writeFile(join(dir, "pr.diff"), diff.stdout), writeFile(join(dir, "pr.json"), `${JSON.stringify(metadata, null, 2)}\n`)]))
	return { mode: "diff-only", cwd: dir, headSha: pr.headRefOid, mergeBase: null, files: filesFromDiff(diff.stdout), cleanup } satisfies PreparedWorkspace
})

/**
 * Prepare an isolated, read-only place for the agent to look at the PR: a
 * detached git worktree of the local clone when one is configured in
 * `repoPaths`, otherwise a temp dir with `pr.diff` and `pr.json`.
 */
export const prepareWorkspace = Effect.fn("review.prepareWorkspace")(function* (options: PrepareWorkspaceOptions) {
	const clone = resolveRepoPath(options.repoPaths, options.pullRequest.repository)
	const run = { timeoutMs: options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS, log: options.log }
	if (clone && existsSync(clone) && (yield* isGitRepo(clone, run))) {
		return yield* prepareWorktree(clone, options)
	}
	options.log?.write(clone ? `repo path ${clone} is not a git checkout; using diff-only mode\n` : "no local clone configured; using diff-only mode\n")
	return yield* prepareDiffOnly(options)
})
