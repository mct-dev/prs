import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect } from "effect"
import type { RepoPaths } from "../editorCommand.js"
import { errorMessage } from "../errors.js"
import { type AgentOutcome, buildClaudeInvocation, buildCodexInvocation, parseClaudeResult, parseCodexOutput } from "./agents.js"
import { decodeRiskBrief, type RiskBrief, riskBriefJsonSchemaString } from "./briefSchema.js"
import type { ReviewPreset } from "./config.js"
import { buildReviewPrompt } from "./prompt.js"
import { openRunLog, type RunLog, runLogged } from "./process.js"
import type { AgentReviewRecord } from "./types.js"
import { type PreparedWorkspace, prepareWorkspace, type WorkspacePullRequest } from "./workspace.js"

export interface ReviewPaths {
	readonly runsDir: string
	readonly worktreesDir: string
	readonly tempDir: string
}

export interface RunReviewInput {
	readonly id: string
	readonly pullRequest: WorkspacePullRequest
	readonly preset: ReviewPreset
	readonly repoPaths: RepoPaths
	readonly paths: ReviewPaths
	readonly timeoutMs: number
	readonly startedAt: Date
	/** Called with every state change (running, then done/error/cancelled). */
	readonly persist: (record: AgentReviewRecord, brief: RiskBrief | null) => Effect.Effect<void>
	readonly ghCommand?: string
}

export const runLogPath = (runsDir: string, id: string) => join(runsDir, `${id}.log`)

export const initialReviewRecord = (input: Pick<RunReviewInput, "id" | "pullRequest" | "preset" | "paths" | "startedAt">): AgentReviewRecord => ({
	id: input.id,
	repository: input.pullRequest.repository,
	number: input.pullRequest.number,
	headSha: input.pullRequest.headRefOid,
	preset: input.preset.id,
	agent: input.preset.agent,
	status: "running",
	mode: null,
	briefJson: null,
	error: null,
	logPath: runLogPath(input.paths.runsDir, input.id),
	costUsd: null,
	startedAt: input.startedAt,
	finishedAt: null,
})

const invokeAgent = Effect.fn("review.invokeAgent")(function* (input: RunReviewInput, workspace: PreparedWorkspace, log: RunLog) {
	const prompt = buildReviewPrompt(
		{
			repository: input.pullRequest.repository,
			number: input.pullRequest.number,
			title: input.pullRequest.title,
			body: input.pullRequest.body,
			url: input.pullRequest.url,
			baseRefName: input.pullRequest.baseRefName,
			headRefName: input.pullRequest.headRefName,
			headSha: workspace.headSha,
			mergeBase: workspace.mergeBase,
			files: workspace.files,
			mode: workspace.mode,
		},
		input.preset,
	)
	const run = { timeoutMs: input.timeoutMs, log }
	if (input.preset.agent === "claude") {
		const result = yield* runLogged(buildClaudeInvocation({ preset: input.preset, prompt, schemaJson: riskBriefJsonSchemaString, cwd: workspace.cwd }), run)
		return parseClaudeResult(result.stdout, result.exitCode, result.stderr)
	}
	// Codex reads the schema from a file and writes its final message to another; keep both outside the checkout.
	const schemaPath = join(input.paths.runsDir, `${input.id}.schema.json`)
	const outputPath = join(input.paths.runsDir, `${input.id}.out.json`)
	yield* Effect.promise(() => writeFile(schemaPath, riskBriefJsonSchemaString))
	return yield* Effect.gen(function* () {
		const result = yield* runLogged(buildCodexInvocation({ preset: input.preset, prompt, schemaPath, outputPath, cwd: workspace.cwd }), run)
		const file = Bun.file(outputPath)
		const text = (yield* Effect.promise(() => file.exists())) ? yield* Effect.promise(() => file.text()) : null
		return parseCodexOutput(text, result.exitCode, result.stderr)
	}).pipe(Effect.ensuring(Effect.promise(() => Promise.all([rm(schemaPath, { force: true }), rm(outputPath, { force: true })]))))
})

const validate = (outcome: AgentOutcome) =>
	outcome._tag === "Failed"
		? Effect.succeed({ brief: null, error: outcome.message, costUsd: outcome.costUsd })
		: decodeRiskBrief(outcome.output).pipe(
				Effect.map((brief) => ({ brief, error: null, costUsd: outcome.costUsd })),
				Effect.catch((error) => Effect.succeed({ brief: null, error: `Brief did not match the schema: ${errorMessage(error)}`, costUsd: outcome.costUsd })),
			)

/**
 * Run one read-only review end to end: prepare workspace, spawn agent, validate
 * the brief, persist, and always clean the workspace up. Never fails; failures
 * are recorded as `error`, interruption as `cancelled`.
 */
export const runReview = (input: RunReviewInput): Effect.Effect<AgentReviewRecord> =>
	Effect.gen(function* () {
		yield* Effect.promise(() => mkdir(input.paths.runsDir, { recursive: true }))
		const base = initialReviewRecord(input)
		const log = openRunLog(runLogPath(input.paths.runsDir, input.id))
		log.write(`review ${input.id} ${input.pullRequest.repository}#${input.pullRequest.number} @ ${input.pullRequest.headRefOid} preset=${input.preset.id}\n`)
		let current: AgentReviewRecord = base

		const finish = (patch: Partial<AgentReviewRecord>, brief: RiskBrief | null) =>
			Effect.suspend(() => {
				current = { ...current, ...patch, finishedAt: new Date() }
				log.write(`[${current.status}]${current.error ? ` ${current.error}` : ""}\n`)
				return input.persist(current, brief).pipe(Effect.as(current))
			})

		const body = Effect.acquireUseRelease(
			prepareWorkspace({
				pullRequest: input.pullRequest,
				presetId: input.preset.id,
				repoPaths: input.repoPaths,
				worktreesDir: input.paths.worktreesDir,
				tempDir: input.paths.tempDir,
				log,
				...(input.ghCommand ? { ghCommand: input.ghCommand } : {}),
			}),
			(workspace) =>
				Effect.gen(function* () {
					current = { ...current, headSha: workspace.headSha, mode: workspace.mode }
					log.write(`workspace ${workspace.mode} ${workspace.cwd}\n`)
					const outcome = yield* invokeAgent(input, workspace, log)
					for (const note of outcome.notes) log.write(`${note}\n`)
					return yield* validate(outcome)
				}),
			(workspace) => workspace.cleanup.pipe(Effect.tap(() => Effect.sync(() => log.write(`cleaned up ${workspace.cwd}\n`)))),
		)

		return yield* body.pipe(
			Effect.flatMap((result) =>
				result.brief
					? finish({ status: "done", briefJson: JSON.stringify(result.brief), costUsd: result.costUsd, error: null }, result.brief)
					: finish({ status: "error", error: result.error, costUsd: result.costUsd }, null),
			),
			Effect.catch((error) => finish({ status: "error", error: "detail" in error ? error.detail : errorMessage(error) }, null)),
			Effect.onInterrupt(() => finish({ status: "cancelled", error: null }, null).pipe(Effect.asVoid)),
			Effect.ensuring(Effect.promise(() => log.close())),
		)
	})
