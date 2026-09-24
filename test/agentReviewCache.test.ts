import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import type { AgentReviewRecord } from "../src/review/types.ts"
import { CacheService } from "../src/services/CacheService.ts"

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempCachePath = async () => {
	const dir = await mkdtemp(join(tmpdir(), "prs-review-cache-"))
	tempDirs.push(dir)
	return join(dir, "cache.sqlite")
}

const runCache = <A, E>(filename: string, effect: Effect.Effect<A, E, CacheService>) => Effect.runPromise(effect.pipe(Effect.provide(CacheService.layerSqliteFile(filename))))

const record = (overrides: Partial<AgentReviewRecord> = {}): AgentReviewRecord => ({
	id: "run-1",
	repository: "owner/repo",
	number: 1,
	headSha: "abc1234",
	preset: "claude",
	agent: "claude",
	status: "running",
	mode: "worktree",
	briefJson: null,
	error: null,
	logPath: "/tmp/run-1.log",
	costUsd: null,
	startedAt: new Date("2026-01-01T00:00:00Z"),
	finishedAt: null,
	...overrides,
})

describe("CacheService agent reviews", () => {
	test("round-trips and updates a run by id", async () => {
		const filename = await tempCachePath()
		const done = record({ status: "done", briefJson: '{"risk":"low"}', costUsd: 0.25, finishedAt: new Date("2026-01-01T00:05:00Z") })
		const result = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeAgentReview(record())
				const running = yield* cache.readLatestAgentReview({ repository: "owner/repo", number: 1 })
				yield* cache.writeAgentReview(done)
				const latest = yield* cache.readLatestAgentReview({ repository: "owner/repo", number: 1 })
				const missing = yield* cache.readLatestAgentReview({ repository: "owner/repo", number: 2 })
				return { running, latest, missing }
			}),
		)
		expect(result.running?.status).toBe("running")
		expect(result.latest).toEqual(done)
		expect(result.missing).toBeNull()
	})

	test("readLatestAgentReviews returns the newest run per PR", async () => {
		const filename = await tempCachePath()
		const rows = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeAgentReview(record({ id: "a", status: "error", error: "boom" }))
				yield* cache.writeAgentReview(record({ id: "b", status: "done", startedAt: new Date("2026-01-02T00:00:00Z") }))
				yield* cache.writeAgentReview(record({ id: "c", number: 2, status: "cancelled" }))
				return yield* cache.readLatestAgentReviews()
			}),
		)
		expect(rows.map((row) => row.id).sort()).toEqual(["b", "c"])
	})

	test("markInterruptedAgentReviews turns stale running rows into errors", async () => {
		const filename = await tempCachePath()
		await runCache(
			filename,
			CacheService.use((cache) => cache.writeAgentReview(record())),
		)
		const latest = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.markInterruptedAgentReviews()
				return yield* cache.readLatestAgentReview({ repository: "owner/repo", number: 1 })
			}),
		)
		expect(latest?.status).toBe("error")
		expect(latest?.error).toContain("Interrupted")
		expect(latest?.finishedAt).toBeInstanceOf(Date)
	})
})
