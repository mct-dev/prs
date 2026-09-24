import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act, useState } from "react"
import { useItemLoadMore, type UseItemLoadMoreResult } from "../src/hooks/useItemLoadMore.ts"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

interface TestLoad {
	readonly data: readonly number[]
	readonly endCursor: string | null
}

const deferred = <Value,>() => {
	let resolve!: (value: Value) => void
	const promise = new Promise<Value>((res) => {
		resolve = res
	})
	return { promise, resolve }
}

const settle = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))

describe("useItemLoadMore", () => {
	test("rejects duplicate starts in the same tick", async () => {
		const setup = await createTestRenderer({ width: 1, height: 1 })
		const root = createRoot(setup.renderer)
		const page = deferred<readonly number[]>()
		const generation = { current: 0 }
		let fetches = 0
		let cache: Partial<Record<string, TestLoad>> = { A: { data: [1], endCursor: "cursor-1" } }
		let result!: UseItemLoadMoreResult

		const Harness = () => {
			const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
			result = useItemLoadMore({
				cacheKey: "A",
				load: cache.A ?? null,
				hasMore: true,
				fetchInFlight: false,
				itemLimit: 10,
				pageSize: 5,
				refreshGenerationRef: generation,
				loadingMoreKey,
				setLoadingMoreKey,
				fetchPage: () => {
					fetches += 1
					return page.promise
				},
				mergePage: (current, incoming) => ({ ...current, data: [...current.data, ...incoming] }),
				setLoadCache: (update) => {
					cache = update(cache)
				},
				persistLoad: () => {},
				flashNotice: () => {},
				timeoutMessage: "timed out",
			})
			return null
		}

		act(() => root.render(<Harness />))
		act(() => {
			expect(result.loadMore()).toBe(true)
			expect(result.loadMore()).toBe(false)
		})
		expect(fetches).toBe(1)

		page.resolve([2])
		await act(settle)
		expect(cache.A?.data).toEqual([1, 2])

		act(() => root.unmount())
		setup.renderer.destroy()
	})

	test("an old A finalizer cannot release a newer A invocation after A to B to A", async () => {
		const setup = await createTestRenderer({ width: 1, height: 1 })
		const root = createRoot(setup.renderer)
		const oldA = deferred<readonly number[]>()
		const newA = deferred<readonly number[]>()
		const generation = { current: 0 }
		let cacheKey = "A"
		let fetches = 0
		let cache: Partial<Record<string, TestLoad>> = { A: { data: [1], endCursor: "cursor-1" }, B: { data: [9], endCursor: "cursor-b" } }
		let result!: UseItemLoadMoreResult

		const Harness = () => {
			const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
			result = useItemLoadMore({
				cacheKey,
				load: cache[cacheKey] ?? null,
				hasMore: true,
				fetchInFlight: false,
				itemLimit: 10,
				pageSize: 5,
				refreshGenerationRef: generation,
				loadingMoreKey,
				setLoadingMoreKey,
				fetchPage: () => {
					fetches += 1
					return fetches === 1 ? oldA.promise : newA.promise
				},
				mergePage: (current, incoming) => ({ ...current, data: [...current.data, ...incoming] }),
				setLoadCache: (update) => {
					cache = update(cache)
				},
				persistLoad: () => {},
				flashNotice: () => {},
				timeoutMessage: "timed out",
			})
			return null
		}

		act(() => root.render(<Harness />))
		act(() => {
			expect(result.loadMore()).toBe(true)
			generation.current += 1
			result.resetLoadingMore()
			cacheKey = "B"
			root.render(<Harness />)
		})
		act(() => {
			generation.current += 1
			result.resetLoadingMore()
			cacheKey = "A"
			root.render(<Harness />)
		})
		act(() => {
			expect(result.loadMore()).toBe(true)
		})

		oldA.resolve([2])
		await act(settle)
		expect(result.isLoadingMore).toBe(true)
		expect(result.loadMore()).toBe(false)
		expect(cache.A?.data).toEqual([1])

		newA.resolve([3])
		await act(settle)
		expect(result.isLoadingMore).toBe(false)
		expect(cache.A?.data).toEqual([1, 3])

		act(() => root.unmount())
		setup.renderer.destroy()
	})
})
