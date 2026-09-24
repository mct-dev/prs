import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { parseReviewConfig } from "../src/review/config.ts"
import { runReview, type ReviewPaths } from "../src/review/runReview.ts"
import type { AgentReviewRecord } from "../src/review/types.ts"
import type { WorkspacePullRequest } from "../src/review/workspace.ts"
import { AgentRunner } from "../src/services/AgentRunner.ts"
import { CacheService } from "../src/services/CacheService.ts"

const fakeAgent = join(import.meta.dir, "fixtures", "fake-review-agent.sh")
const fakeGh = join(import.meta.dir, "fixtures", "fake-gh.sh")

let root = ""
let paths: ReviewPaths
const envKeys = ["FAKE_AGENT_MODE", "FAKE_AGENT_RECORD", "FAKE_AGENT_CHILD_PID", "FAKE_AGENT_COPY_CONTEXT"] as const

beforeEach(async () => {
	root = realpathSync(await mkdtemp(join(tmpdir(), "prs-run-review-")))
	paths = { runsDir: join(root, "runs"), worktreesDir: join(root, "worktrees"), tempDir: join(root, "tmp") }
})

afterEach(async () => {
	for (const key of envKeys) delete process.env[key]
	await rm(root, { recursive: true, force: true })
})

const presets = parseReviewConfig(undefined, fakeAgent).presets

const pullRequest = (overrides: Partial<WorkspacePullRequest> = {}): WorkspacePullRequest => ({
	repository: "owner/repo",
	number: 1,
	headRefOid: "0000000000000000000000000000000000000000",
	headRefName: "feature",
	baseRefName: "main",
	title: "Add greeting",
	body: "Adds hello.txt",
	url: "https://github.com/owner/repo/pull/1",
	author: "author",
	additions: 1,
	deletions: 0,
	changedFiles: 1,
	...overrides,
})

const run = (overrides: { pr?: WorkspacePullRequest; preset?: keyof typeof presets; repoPaths?: Record<string, string>; timeoutMs?: number } = {}) => {
	const records: AgentReviewRecord[] = []
	return Effect.runPromise(
		runReview({
			id: "run-1",
			pullRequest: overrides.pr ?? pullRequest(),
			preset: presets[overrides.preset ?? "claude"]!,
			repoPaths: overrides.repoPaths ?? {},
			paths,
			timeoutMs: overrides.timeoutMs ?? 30_000,
			startedAt: new Date(),
			persist: (record) => Effect.sync(() => void records.push(record)),
			ghCommand: fakeGh,
		}),
	).then((record) => ({ record, records }))
}

const recordedArgs = (file: string) => {
	const [cwd = "", ...args] = readFileSync(file, "utf8").split("\0").slice(0, -1)
	return { cwd, args }
}

const git = (cwd: string, ...args: string[]) => {
	const proc = Bun.spawnSync({
		cmd: ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args],
		cwd,
	})
	if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`)
	return proc.stdout.toString().trim()
}

/** A bare "origin" with main and refs/pull/1/head, plus a local clone of it. */
const makeRepos = async () => {
	const work = join(root, "work")
	const origin = join(root, "origin.git")
	const clone = join(root, "clone")
	git(root, "init", "-q", "-b", "main", work)
	await writeFile(join(work, "README.md"), "readme\n")
	git(work, "add", ".")
	git(work, "commit", "-q", "-m", "init")
	git(root, "clone", "-q", "--bare", work, origin)
	git(root, "clone", "-q", origin, clone)
	git(work, "checkout", "-q", "-b", "feature")
	await writeFile(join(work, "hello.txt"), "hello\n")
	git(work, "add", ".")
	git(work, "commit", "-q", "-m", "greet")
	const sha = git(work, "rev-parse", "HEAD")
	git(work, "push", "-q", origin, "HEAD:refs/pull/1/head")
	git(work, "checkout", "-q", "main")
	git(work, "checkout", "-q", "-b", "other")
	await writeFile(join(work, "other.txt"), "other\n")
	git(work, "add", ".")
	git(work, "commit", "-q", "-m", "other change")
	const otherSha = git(work, "rev-parse", "HEAD")
	git(work, "push", "-q", origin, "HEAD:refs/pull/2/head")
	return { clone, sha, otherSha }
}

const contextCopies = () =>
	readdirSync(root)
		.filter((name) => name.startsWith("context-"))
		.map((name) => join(root, name))

describe("runReview", () => {
	test("diff-only mode: claude brief is validated, logged, and the temp dir removed", async () => {
		process.env.FAKE_AGENT_RECORD = join(root, "args.txt")
		const { record, records } = await run()
		expect(record.status).toBe("done")
		expect(record.mode).toBe("diff-only")
		expect(record.costUsd).toBe(0.12)
		expect(JSON.parse(record.briefJson!).risk).toBe("medium")
		expect(records.map((entry) => entry.status)).toEqual(["done"])

		const { cwd, args } = recordedArgs(process.env.FAKE_AGENT_RECORD)
		expect(args[0]).toBe("-p")
		expect(args[1]).toStartWith("/review\n")
		expect(args[1]).toContain("diff-only mode")
		expect(args[1]).toContain("- hello.txt")
		expect(args).toContain("dontAsk")
		expect(cwd.startsWith(paths.tempDir)).toBe(true)
		expect(existsSync(cwd)).toBe(false)

		const log = readFileSync(record.logPath!, "utf8")
		expect(log).toContain("fake agent starting")
		expect(log).toContain("[done]")
	})

	test("worktree mode: checks out the PR head detached and removes the worktree", async () => {
		const { clone, sha } = await makeRepos()
		process.env.FAKE_AGENT_RECORD = join(root, "args.txt")
		const { record } = await run({ pr: pullRequest({ headRefOid: sha }), repoPaths: { "owner/repo": clone } })
		expect(record.status).toBe("done")
		expect(record.mode).toBe("worktree")
		expect(record.headSha).toBe(sha)

		const { cwd, args } = recordedArgs(process.env.FAKE_AGENT_RECORD)
		expect(cwd).toBe(join(paths.worktreesDir, `owner-repo-1-${sha.slice(0, 7)}-claude`))
		expect(args[1]).toContain("- hello.txt")
		expect(args[1]).toContain(".prs-context/diff.patch")
		expect(existsSync(cwd)).toBe(false)
		expect(git(clone, "worktree", "list").split("\n")).toHaveLength(1)
		// Private fetch refs are gone and FETCH_HEAD was never relied on.
		expect(git(clone, "for-each-ref", "refs/prs")).toBe("")
	})

	test("worktree mode: pre-generates diff, log and file list for a shell-less agent", async () => {
		const { clone, sha } = await makeRepos()
		process.env.FAKE_AGENT_COPY_CONTEXT = join(root, "context")
		const { record } = await run({ pr: pullRequest({ headRefOid: sha }), repoPaths: { "owner/repo": clone } })
		expect(record.status).toBe("done")
		const [context] = contextCopies()
		expect(context).toBeDefined()
		const patch = readFileSync(join(context!, "diff.patch"), "utf8")
		expect(patch).toContain("diff --git a/hello.txt b/hello.txt")
		expect(patch).toContain("+hello")
		expect(patch).not.toContain("README.md")
		expect(readFileSync(join(context!, "log.txt"), "utf8")).toContain("greet")
		expect(readFileSync(join(context!, "files.txt"), "utf8")).toBe("hello.txt\n")
	})

	test("worktree mode: concurrent reviews of different PRs on one clone use separate refs", async () => {
		const { clone, sha, otherSha } = await makeRepos()
		process.env.FAKE_AGENT_COPY_CONTEXT = join(root, "context")
		const review = (id: string, pr: WorkspacePullRequest) =>
			runReview({
				id,
				pullRequest: pr,
				preset: presets.claude!,
				repoPaths: { "owner/repo": clone },
				paths,
				timeoutMs: 30_000,
				startedAt: new Date(),
				persist: () => Effect.void,
				ghCommand: fakeGh,
			})
		const [first, second] = await Effect.runPromise(
			Effect.all([review("run-a", pullRequest({ headRefOid: sha })), review("run-b", pullRequest({ number: 2, headRefOid: otherSha }))], { concurrency: "unbounded" }),
		)
		expect([first.status, first.headSha]).toEqual(["done", sha])
		expect([second.status, second.headSha]).toEqual(["done", otherSha])
		const fileLists = contextCopies()
			.map((dir) => readFileSync(join(dir, "files.txt"), "utf8"))
			.sort()
		expect(fileLists).toEqual(["hello.txt\n", "other.txt\n"])
		expect(git(clone, "for-each-ref", "refs/prs")).toBe("")
		expect(git(clone, "worktree", "list").split("\n")).toHaveLength(1)
	})

	test("codex preset reads the -o output file", async () => {
		process.env.FAKE_AGENT_RECORD = join(root, "args.txt")
		const { record } = await run({ preset: "codex" })
		expect(record.status).toBe("done")
		expect(record.costUsd).toBeNull()
		const { args } = recordedArgs(process.env.FAKE_AGENT_RECORD)
		expect(args.slice(0, 3)).toEqual(["exec", "-s", "read-only"])
	})

	test("schema-invalid output is stored as an error", async () => {
		process.env.FAKE_AGENT_MODE = "bad"
		const { record } = await run()
		expect(record.status).toBe("error")
		expect(record.error).toContain("did not match the schema")
		expect(record.costUsd).toBe(0.12)
	})

	test("agent errors keep subtype and cost", async () => {
		process.env.FAKE_AGENT_MODE = "error"
		const { record } = await run()
		expect(record.status).toBe("error")
		expect(record.error).toContain("error_max_budget_usd")
		expect(record.costUsd).toBe(1.5)
	})

	test("times out and kills the process group", async () => {
		process.env.FAKE_AGENT_MODE = "sleep"
		process.env.FAKE_AGENT_CHILD_PID = join(root, "child.pid")
		const { record } = await run({ timeoutMs: 1_000 })
		expect(record.status).toBe("error")
		expect(record.error).toContain("Timed out")
		expect(isAlive(Number(readFileSync(process.env.FAKE_AGENT_CHILD_PID, "utf8")))).toBe(false)
	})
})

const isAlive = (pid: number) => {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

const waitFor = async (predicate: () => boolean, timeoutMs = 5_000) => {
	const deadline = Date.now() + timeoutMs
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error("timed out waiting")
		await Bun.sleep(25)
	}
}

describe("AgentRunner", () => {
	const runnerLayer = (cachePath: string) =>
		AgentRunner.layerWith({
			paths,
			ghCommand: fakeGh,
			loadConfig: Effect.succeed({ review: parseReviewConfig({ concurrency: 1 }, fakeAgent), repoPaths: {} }),
		}).pipe(Layer.provideMerge(CacheService.layerSqliteFile(cachePath)))

	test("runs in the background, persists the brief, and reports staleness", async () => {
		const cachePath = join(root, "cache.sqlite")
		const pr = pullRequest()
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const runner = yield* AgentRunner
				const id = yield* runner.startReview(pr)
				const again = yield* runner.startReview(pr)
				const running = yield* runner.briefStatus(pr)
				let status = running
				while (status._tag === "running") {
					yield* Effect.sleep("25 millis")
					status = yield* runner.briefStatus(pr)
				}
				const fresh = yield* runner.latestBrief(pr.repository, pr.number, pr.headRefOid)
				const stale = yield* runner.latestBrief(pr.repository, pr.number, "1111111")
				const staleStatus = yield* runner.briefStatus({ ...pr, headRefOid: "1111111" })
				return { id, again, running, status, fresh, stale, staleStatus }
			}).pipe(Effect.provide(runnerLayer(cachePath)), Effect.scoped),
		)
		expect(result.again).toBe(result.id)
		expect(result.running._tag).toBe("running")
		expect(result.status._tag).toBe("done")
		expect(result.fresh?.stale).toBe(false)
		expect(result.fresh?.brief?.risk).toBe("medium")
		expect(result.stale?.stale).toBe(true)
		expect(result.staleStatus).toMatchObject({ _tag: "done", stale: true })

		const persisted = await Effect.runPromise(
			CacheService.use((cache) => cache.readLatestAgentReview({ repository: "owner/repo", number: 1 })).pipe(Effect.provide(CacheService.layerSqliteFile(cachePath))),
		)
		expect(persisted?.status).toBe("done")
	})

	test("cancelReview kills the agent's process group and records cancellation", async () => {
		process.env.FAKE_AGENT_MODE = "sleep"
		process.env.FAKE_AGENT_CHILD_PID = join(root, "child.pid")
		const cachePath = join(root, "cache.sqlite")
		const pr = pullRequest()
		const status = await Effect.runPromise(
			Effect.gen(function* () {
				const runner = yield* AgentRunner
				const id = yield* runner.startReview(pr)
				yield* Effect.promise(() => waitFor(() => existsSync(process.env.FAKE_AGENT_CHILD_PID!)))
				expect(yield* runner.cancelReview(id)).toBe(true)
				expect(yield* runner.cancelReview(id)).toBe(false)
				return yield* runner.latestBrief(pr.repository, pr.number, pr.headRefOid)
			}).pipe(Effect.provide(runnerLayer(cachePath)), Effect.scoped),
		)
		expect(status?.record.status).toBe("cancelled")
		const childPid = Number(readFileSync(process.env.FAKE_AGENT_CHILD_PID, "utf8"))
		await waitFor(() => !isAlive(childPid))
		expect(readdirSafe(paths.tempDir)).toEqual([])
	})

	test("cancelling a run still queued behind the concurrency limit records cancellation", async () => {
		process.env.FAKE_AGENT_MODE = "sleep"
		process.env.FAKE_AGENT_CHILD_PID = join(root, "child.pid")
		const cachePath = join(root, "cache.sqlite")
		const first = pullRequest()
		const second = pullRequest({ number: 2, url: "https://github.com/owner/repo/pull/2" })
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const runner = yield* AgentRunner
				const firstId = yield* runner.startReview(first)
				yield* Effect.promise(() => waitFor(() => existsSync(process.env.FAKE_AGENT_CHILD_PID!)))
				const secondId = yield* runner.startReview(second)
				const queued = yield* runner.briefStatus(second)
				expect(yield* runner.cancelReview(secondId)).toBe(true)
				const cancelled = yield* runner.latestBrief(second.repository, second.number, second.headRefOid)
				const stillRunning = yield* runner.briefStatus(first)
				yield* runner.cancelReview(firstId)
				return { queued, cancelled, stillRunning }
			}).pipe(Effect.provide(runnerLayer(cachePath)), Effect.scoped),
		)
		expect(result.queued._tag).toBe("running")
		expect(result.cancelled?.record.status).toBe("cancelled")
		expect(result.cancelled?.record.finishedAt).not.toBeNull()
		expect(result.stillRunning._tag).toBe("running")

		const persisted = await Effect.runPromise(
			CacheService.use((cache) => cache.readLatestAgentReview({ repository: "owner/repo", number: 2 })).pipe(Effect.provide(CacheService.layerSqliteFile(cachePath))),
		)
		expect(persisted?.status).toBe("cancelled")
	})
})

const readdirSafe = (dir: string) => {
	try {
		return readdirSync(dir)
	} catch {
		return []
	}
}
