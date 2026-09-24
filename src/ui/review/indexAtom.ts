import { Effect, Stream } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { ReviewIndex } from "../../review/briefStatus.js"
import { AgentRunner } from "../../services/AgentRunner.js"
import { githubRuntime } from "../../services/runtime.js"

// Kept apart from ./atoms.ts so the pull request atoms (filter lookups) can
// read the index without importing the selection atoms back.

const emptyIndex: ReviewIndex = {}

// Latest agent review per PR, live. Seeded from the cache when the runner
// starts and updated whenever a run starts, finishes, fails or is cancelled.
const agentReviewIndexResultAtom = githubRuntime.atom(Stream.unwrap(AgentRunner.use((runner) => Effect.succeed(runner.changes)))).pipe(Atom.keepAlive)

export const agentReviewIndexAtom = Atom.make((get): ReviewIndex => AsyncResult.getOrElse(get(agentReviewIndexResultAtom), () => emptyIndex))
