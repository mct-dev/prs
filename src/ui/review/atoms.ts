import { Effect, Stream } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { PullRequestItem } from "../../domain.js"
import { type BriefStatus, briefStatusFor as briefStatusFromIndex, type ReviewIndex } from "../../review/briefStatus.js"
import { AgentRunner } from "../../services/AgentRunner.js"
import { githubRuntime } from "../../services/runtime.js"

export type { BriefStatus } from "../../review/briefStatus.js"

type BriefTarget = Pick<PullRequestItem, "repository" | "number" | "headRefOid">

const emptyIndex: ReviewIndex = {}

// Latest agent review per PR, live. Seeded from the cache when the runner
// starts and updated whenever a run starts, finishes, fails or is cancelled.
const agentReviewIndexResultAtom = githubRuntime.atom(Stream.unwrap(AgentRunner.use((runner) => Effect.succeed(runner.changes)))).pipe(Atom.keepAlive)

export const agentReviewIndexAtom = Atom.make((get): ReviewIndex => AsyncResult.getOrElse(get(agentReviewIndexResultAtom), () => emptyIndex))

// Keyed by repo + number + head SHA so a force-push re-derives `stale`.
const briefKey = (pullRequest: BriefTarget) => `${pullRequest.repository}\u0000${pullRequest.number}\u0000${pullRequest.headRefOid}`

const parseBriefKey = (key: string): BriefTarget => {
	const [repository, number, headRefOid] = key.split("\u0000")
	return { repository: repository ?? "", number: Number(number ?? 0), headRefOid: headRefOid ?? "" }
}

/** Per-PR brief state: idle | running | done (with stale flag) | error. */
export const briefStatusFamily = Atom.family((key: string) => {
	const target = parseBriefKey(key)
	return Atom.make((get): BriefStatus => briefStatusFromIndex(get(agentReviewIndexAtom), target))
})

export const briefStatusFor = (pullRequest: BriefTarget) => briefStatusFamily(briefKey(pullRequest))

/** Starts a read-only agent review for a PR with the given (or default) preset; resolves to the run id. */
export const runAgentReviewAtom = githubRuntime.fn<{ readonly pullRequest: PullRequestItem; readonly presetId?: string | null }>()(({ pullRequest, presetId }) =>
	AgentRunner.use((runner) => runner.startReview(pullRequest, presetId ?? null)),
)

/** Cancels the running review for a PR, if any; resolves to whether one was cancelled. */
export const cancelAgentReviewAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()(({ repository, number }) =>
	AgentRunner.use((runner) => runner.cancelReviewFor(repository, number)),
)
