import type { PullRequestItem } from "../domain.js"
import { decodeRiskBriefSync, type RiskBrief, type RiskLevel } from "./briefSchema.js"
import type { AgentReviewRecord } from "./types.js"

/** Latest review run for a PR plus its decoded brief (when done). */
export interface ReviewEntry {
	readonly record: AgentReviewRecord
	readonly brief: RiskBrief | null
}

/** Latest review per PR, keyed by {@link reviewKey}. */
export type ReviewIndex = Readonly<Record<string, ReviewEntry>>

export const reviewKey = (repository: string, number: number) => `${repository}#${number}`

export const reviewEntryFromRecord = (record: AgentReviewRecord): ReviewEntry => {
	if (record.status !== "done" || !record.briefJson) return { record, brief: null }
	try {
		return { record, brief: decodeRiskBriefSync(JSON.parse(record.briefJson)) }
	} catch {
		return { record: { ...record, status: "error", error: "Stored brief is invalid" }, brief: null }
	}
}

export type BriefStatus =
	| { readonly _tag: "idle" }
	| { readonly _tag: "running"; readonly startedAt: Date; readonly runId: string }
	| { readonly _tag: "done"; readonly brief: RiskBrief; readonly stale: boolean; readonly costUsd: number | null; readonly headSha: string }
	| { readonly _tag: "error"; readonly message: string; readonly stale: boolean }

export const idleBriefStatus: BriefStatus = { _tag: "idle" }

type BriefTarget = Pick<PullRequestItem, "repository" | "number" | "headRefOid">

/** Brief state for a PR. `stale` means the brief was made for a different head commit. */
export const briefStatusFor = (index: ReviewIndex, pullRequest: BriefTarget): BriefStatus => {
	const entry = index[reviewKey(pullRequest.repository, pullRequest.number)]
	if (!entry) return idleBriefStatus
	const { record } = entry
	const stale = pullRequest.headRefOid.length > 0 && record.headSha !== pullRequest.headRefOid
	switch (record.status) {
		case "running":
			return { _tag: "running", startedAt: record.startedAt, runId: record.id }
		case "done":
			return entry.brief ? { _tag: "done", brief: entry.brief, stale, costUsd: record.costUsd, headSha: record.headSha } : { _tag: "error", message: "Brief missing", stale }
		case "error":
			return { _tag: "error", message: record.error ?? "Review failed", stale }
		case "cancelled":
			return idleBriefStatus
	}
}

/** Value for the `brief:` filter: none | stale | running | done. */
export const briefFilterValue = (status: BriefStatus): "none" | "stale" | "running" | "done" => {
	switch (status._tag) {
		case "idle":
		case "error":
			return "none"
		case "running":
			return "running"
		case "done":
			return status.stale ? "stale" : "done"
	}
}

/** Value for the `risk:` filter, or null when there is no finished brief. */
export const briefRisk = (status: BriefStatus): RiskLevel | null => (status._tag === "done" ? status.brief.risk : null)
