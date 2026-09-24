import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Context, Effect, Exit, FiberMap, Layer, Schema, Semaphore, Stream, SubscriptionRef } from "effect"
import { config } from "../config.js"
import type { RiskBrief } from "../review/briefSchema.js"
import { type BriefStatus, briefStatusFor, reviewEntryFromRecord, type ReviewIndex, reviewKey } from "../review/briefStatus.js"
import { type ReviewConfig, resolvePreset } from "../review/config.js"
import { initialReviewRecord, type ReviewPaths, runReview } from "../review/runReview.js"
import type { AgentReviewRecord } from "../review/types.js"
import type { WorkspacePullRequest } from "../review/workspace.js"
import { loadStoredReviewConfig, type StoredReviewConfig } from "../themeStore.js"
import { CacheService } from "./CacheService.js"

export class AgentReviewError extends Schema.TaggedErrorClass<AgentReviewError>()("AgentReviewError", {
	message: Schema.String,
}) {}

export interface LatestBrief {
	readonly record: AgentReviewRecord
	readonly brief: RiskBrief | null
	/** True when the brief was produced for a different head commit than `currentHeadSha`. */
	readonly stale: boolean
}

export interface AgentRunnerOptions {
	readonly paths: ReviewPaths
	readonly loadConfig: Effect.Effect<StoredReviewConfig>
	readonly ghCommand?: string
}

const cacheDirectory = () => (config.cachePath ? dirname(config.cachePath) : join(tmpdir(), "prs"))

export const defaultReviewPaths = (): ReviewPaths => ({
	runsDir: join(cacheDirectory(), "runs"),
	worktreesDir: join(cacheDirectory(), "worktrees"),
	tempDir: join(tmpdir(), "prs-reviews"),
})

interface ActiveRun {
	readonly key: string
	readonly headSha: string
	readonly preset: string
}

export class AgentRunner extends Context.Service<
	AgentRunner,
	{
		/** Start a read-only review in the background and return its run id. Dedupes identical live runs. */
		readonly startReview: (pullRequest: WorkspacePullRequest, presetId?: string | null) => Effect.Effect<string, AgentReviewError>
		/** Interrupt a run: kills the agent's process group and removes its workspace. */
		readonly cancelReview: (runId: string) => Effect.Effect<boolean>
		/** Cancel whatever review is running for a PR. */
		readonly cancelReviewFor: (repository: string, number: number) => Effect.Effect<boolean>
		readonly latestBrief: (repository: string, number: number, currentHeadSha: string) => Effect.Effect<LatestBrief | null>
		readonly briefStatus: (pullRequest: Pick<WorkspacePullRequest, "repository" | "number" | "headRefOid">) => Effect.Effect<BriefStatus>
		readonly index: Effect.Effect<ReviewIndex>
		/** The review config (presets, default preset) as currently stored. */
		readonly config: Effect.Effect<ReviewConfig>
		/** Current index followed by every change. */
		readonly changes: Stream.Stream<ReviewIndex>
	}
>()("ghui/AgentRunner") {
	static readonly layerWith = (options: AgentRunnerOptions): Layer.Layer<AgentRunner, never, CacheService> =>
		Layer.effect(
			AgentRunner,
			Effect.gen(function* () {
				const cache = yield* CacheService
				const initialConfig = yield* options.loadConfig
				const semaphore = yield* Semaphore.make(initialConfig.review.concurrency)
				const fibers = yield* FiberMap.make<string>()
				const active = new Map<string, ActiveRun>()

				// Runs left `running` by a previous process can never finish.
				yield* cache.markInterruptedAgentReviews()
				const stored = yield* cache.readLatestAgentReviews().pipe(Effect.orElseSucceed(() => []))
				const ref = yield* SubscriptionRef.make<ReviewIndex>(
					Object.fromEntries(stored.map((record) => [reviewKey(record.repository, record.number), reviewEntryFromRecord(record)])),
				)

				const publish = (record: AgentReviewRecord, brief: RiskBrief | null) =>
					SubscriptionRef.update(ref, (index) => ({ ...index, [reviewKey(record.repository, record.number)]: { record, brief } }))

				const persist = (record: AgentReviewRecord, brief: RiskBrief | null) => cache.writeAgentReview(record).pipe(Effect.andThen(publish(record, brief)))

				const startReview = Effect.fn("AgentRunner.startReview")(function* (pullRequest: WorkspacePullRequest, presetId?: string | null) {
					const { review, repoPaths } = yield* options.loadConfig
					const preset = resolvePreset(review, presetId)
					if (!preset) return yield* new AgentReviewError({ message: `Unknown review preset: ${presetId ?? review.defaultPreset}` })
					const key = reviewKey(pullRequest.repository, pullRequest.number)
					for (const [runId, run] of active) {
						if (run.key === key && run.headSha === pullRequest.headRefOid && run.preset === preset.id && (yield* FiberMap.has(fibers, runId))) return runId
					}

					const id = randomUUID()
					// Last record written for this run, so the exit handler can tell
					// whether `runReview` already reached a terminal state.
					let latest: AgentReviewRecord | null = null
					const track = (record: AgentReviewRecord, brief: RiskBrief | null) =>
						Effect.suspend(() => {
							latest = record
							return persist(record, brief)
						})
					const input = {
						id,
						pullRequest,
						preset,
						repoPaths,
						paths: options.paths,
						timeoutMs: review.timeoutMs,
						startedAt: new Date(),
						persist: track,
						...(options.ghCommand ? { ghCommand: options.ghCommand } : {}),
					}
					active.set(id, { key, headSha: pullRequest.headRefOid, preset: preset.id })
					yield* track(initialReviewRecord(input), null)
					// A run cancelled (or failing) while still queued on the semaphore never
					// enters `runReview`, so finalize its record here.
					const finalize = (exit: Exit.Exit<AgentReviewRecord>) =>
						Effect.suspend(() => {
							const record = latest
							if (!record || record.status !== "running") return Effect.void
							const cancelled = Exit.hasInterrupts(exit)
							return track({ ...record, status: cancelled ? "cancelled" : "error", error: cancelled ? null : "Review ended unexpectedly", finishedAt: new Date() }, null)
						})
					yield* FiberMap.run(
						fibers,
						id,
					)(
						semaphore
							.withPermits(1)(runReview(input))
							.pipe(Effect.onExit(finalize), Effect.ensuring(Effect.sync(() => active.delete(id)))),
					)
					return id
				})

				const cancelReview = Effect.fn("AgentRunner.cancelReview")(function* (runId: string) {
					if (!(yield* FiberMap.has(fibers, runId))) return false
					yield* FiberMap.remove(fibers, runId)
					return true
				})

				const cancelReviewFor = Effect.fn("AgentRunner.cancelReviewFor")(function* (repository: string, number: number) {
					const key = reviewKey(repository, number)
					let cancelled = false
					// Collect first: cancelling removes entries from `active`.
					const runIds = Array.from(active).flatMap(([runId, run]) => (run.key === key ? [runId] : []))
					for (const runId of runIds) cancelled = (yield* cancelReview(runId)) || cancelled
					return cancelled
				})

				const latestBrief = Effect.fn("AgentRunner.latestBrief")(function* (repository: string, number: number, currentHeadSha: string) {
					const entry = (yield* SubscriptionRef.get(ref))[reviewKey(repository, number)]
					const record = entry?.record ?? (yield* cache.readLatestAgentReview({ repository, number }).pipe(Effect.orElseSucceed(() => null)))
					if (!record) return null
					const brief = entry?.brief ?? reviewEntryFromRecord(record).brief
					return { record, brief, stale: record.headSha !== currentHeadSha }
				})

				const briefStatus = (pullRequest: Pick<WorkspacePullRequest, "repository" | "number" | "headRefOid">) =>
					SubscriptionRef.get(ref).pipe(Effect.map((index) => briefStatusFor(index, pullRequest)))

				return AgentRunner.of({
					startReview,
					cancelReview,
					cancelReviewFor,
					latestBrief,
					briefStatus,
					index: SubscriptionRef.get(ref),
					config: Effect.map(options.loadConfig, (stored) => stored.review),
					changes: SubscriptionRef.changes(ref),
				})
			}),
		)

	static readonly layer = Layer.unwrap(Effect.sync(() => AgentRunner.layerWith({ paths: defaultReviewPaths(), loadConfig: loadStoredReviewConfig })))
}
