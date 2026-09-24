import { Effect, Schedule } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { isCommandTimeoutError } from "../services/CommandRunner.js"
import { isGitHubRateLimitError } from "../services/GitHubService.js"
import { initialRetryProgress, RetryProgress } from "../ui/FooterHints.js"

export const ITEM_QUEUE_FETCH_RETRIES = 6

export const shouldRetryItemQueueFetch = (error: unknown): boolean => !isGitHubRateLimitError(error) && !isCommandTimeoutError(error)

export const retryItemQueueFirstPage = <A, E, R>(effect: Effect.Effect<A, E, R>, retryProgressAtom: Atom.Writable<RetryProgress>) =>
	Effect.gen(function* () {
		yield* Atom.set(retryProgressAtom, initialRetryProgress)
		return yield* effect.pipe(
			Effect.tapError((error) =>
				shouldRetryItemQueueFetch(error)
					? Atom.update(retryProgressAtom, (current) =>
							RetryProgress.Retrying({
								attempt: Math.min(RetryProgress.$match(current, { Idle: () => 0, Retrying: ({ attempt }) => attempt }) + 1, ITEM_QUEUE_FETCH_RETRIES),
								max: ITEM_QUEUE_FETCH_RETRIES,
							}),
						)
					: Effect.void,
			),
			Effect.retry({ times: ITEM_QUEUE_FETCH_RETRIES, schedule: Schedule.exponential("300 millis", 2), while: shouldRetryItemQueueFetch }),
			Effect.ensuring(Atom.set(retryProgressAtom, initialRetryProgress)),
		)
	})
