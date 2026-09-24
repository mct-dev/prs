import type { ReviewAgentKind } from "./config.js"
import type { ReviewMode } from "./prompt.js"

export type AgentReviewStatus = "running" | "done" | "error" | "cancelled"

/** One agent review run, as persisted in the `agent_reviews` cache table. */
export interface AgentReviewRecord {
	readonly id: string
	readonly repository: string
	readonly number: number
	readonly headSha: string
	readonly preset: string
	readonly agent: ReviewAgentKind
	readonly status: AgentReviewStatus
	readonly mode: ReviewMode | null
	readonly briefJson: string | null
	readonly error: string | null
	readonly logPath: string | null
	readonly costUsd: number | null
	readonly startedAt: Date
	readonly finishedAt: Date | null
}
