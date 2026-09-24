import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { retryItemQueueFirstPage } from "../src/item/retry.ts"
import { initialRetryProgress, type RetryProgress } from "../src/ui/FooterHints.tsx"

const makeRetryProgressAtom = () => Atom.make<RetryProgress>(initialRetryProgress).pipe(Atom.keepAlive)

describe("Item queue first-page retry", () => {
	test("retries a transient failure, reports retry progress, and returns to idle after success", async () => {
		let attempts = 0
		let progressDuringRetry: unknown
		const registry = AtomRegistry.make()
		const retryProgressAtom = makeRetryProgressAtom()
		const effect = Effect.suspend(() => {
			attempts += 1
			if (attempts === 1) return Effect.fail("offline")
			progressDuringRetry = registry.get(retryProgressAtom)
			return Effect.succeed("loaded")
		})

		const result = await Effect.runPromise(retryItemQueueFirstPage(effect, retryProgressAtom).pipe(Effect.provideService(AtomRegistry.AtomRegistry, registry)))

		expect(result).toBe("loaded")
		expect(attempts).toBe(2)
		expect(progressDuringRetry).toEqual({ _tag: "Retrying", attempt: 1, max: 6 })
		expect(registry.get(retryProgressAtom)).toEqual({ _tag: "Idle" })
	})

	for (const error of [new Error("API rate limit exceeded for user"), new Error("Timed out after 30000ms running gh")]) {
		test(`does not retry ${error.message}`, async () => {
			let attempts = 0
			const registry = AtomRegistry.make()
			const retryProgressAtom = makeRetryProgressAtom()
			const effect = Effect.suspend(() => {
				attempts += 1
				return Effect.fail(error)
			})

			const exit = await Effect.runPromiseExit(retryItemQueueFirstPage(effect, retryProgressAtom).pipe(Effect.provideService(AtomRegistry.AtomRegistry, registry)))

			expect(exit._tag).toBe("Failure")
			expect(attempts).toBe(1)
			expect(registry.get(retryProgressAtom)).toEqual({ _tag: "Idle" })
		})
	}
})
