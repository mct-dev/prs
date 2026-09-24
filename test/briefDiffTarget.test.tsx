import { describe, expect, test } from "bun:test"
import { RegistryContext } from "@effect/atom-react"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { act } from "react"
import type { StackedDiffCommentAnchor } from "../src/ui/diff.ts"
import { pendingBriefDiffTargetAtom, type PendingBriefDiffTarget } from "../src/ui/review/briefViewAtoms.ts"
import { useBriefDiffTarget } from "../src/ui/review/useBriefDiffTarget.ts"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const URL_A = "https://example.test/pr/1"
const HEAD = "head-1"
const files = [{ name: "README.md" }, { name: "src/cache.ts" }, { name: "assets/logo.png" }]
const anchor = (fileIndex: number, line: number, renderLine: number) => ({ fileIndex, line, side: "RIGHT", renderLine }) as unknown as StackedDiffCommentAnchor
const anchors = [anchor(0, 1, 2), anchor(1, 30, 10), anchor(1, 42, 14), anchor(1, 50, 18)]

const mount = async (
	pending: PendingBriefDiffTarget,
	selectedPullRequestUrl: string,
	{ selectedHeadSha = HEAD, diffCommentAnchors = anchors }: { readonly selectedHeadSha?: string; readonly diffCommentAnchors?: readonly StackedDiffCommentAnchor[] } = {},
) => {
	const registry = AtomRegistry.make({ initialValues: [[pendingBriefDiffTargetAtom, pending]] })
	const calls = { fileIndex: [] as number[], anchorIndex: [] as number[], visible: [] as number[], fileTop: [] as number[], notices: [] as string[] }
	const Probe = () => {
		useBriefDiffTarget({
			selectedPullRequestUrl,
			selectedHeadSha,
			diffFullView: true,
			readyDiffFiles: files,
			diffCommentAnchors,
			setDiffFileIndex: (index) => calls.fileIndex.push(index),
			setDiffCommentAnchorIndex: (index) => calls.anchorIndex.push(index),
			ensureDiffLineVisible: (line) => calls.visible.push(line),
			scrollToDiffFile: (index) => calls.fileTop.push(index),
			flashNotice: (message) => calls.notices.push(message),
		})
		return <text>probe</text>
	}
	const setup = await createTestRenderer({ width: 20, height: 2 })
	const root = createRoot(setup.renderer)
	act(() => {
		root.render(
			<RegistryContext.Provider value={registry}>
				<Probe />
			</RegistryContext.Provider>,
		)
	})
	await setup.renderOnce()
	await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
	const remaining = registry.get(pendingBriefDiffTargetAtom)
	act(() => root.unmount())
	setup.renderer.destroy()
	return { calls, remaining }
}

describe("brief focus → diff", () => {
	test("selects the focus area's file and nearest new-side line, then settles the scroll", async () => {
		const { calls, remaining } = await mount({ url: URL_A, headSha: HEAD, file: "src/cache.ts", lines: "40-58" }, URL_A)
		expect(remaining).toBeNull()
		expect(calls.fileIndex).toEqual([1])
		expect(calls.anchorIndex).toEqual([2])
		expect(calls.visible).toEqual([14, 14, 14, 14, 14, 14])
		expect(calls.fileTop).toEqual([])
		expect(calls.notices).toEqual([])
	})

	test("a file outside the diff flashes a notice and does not move", async () => {
		const { calls, remaining } = await mount({ url: URL_A, headSha: HEAD, file: "src/missing.ts", lines: "1" }, URL_A)
		expect(remaining).toBeNull()
		expect(calls.notices).toEqual(["Not in this diff: src/missing.ts"])
		expect(calls.fileIndex).toEqual([])
	})

	test("a target parked for another PR is dropped, not applied", async () => {
		const { calls, remaining } = await mount({ url: URL_A, headSha: HEAD, file: "src/cache.ts", lines: "40" }, "https://example.test/pr/2")
		expect(remaining).toBeNull()
		expect(calls).toEqual({ fileIndex: [], anchorIndex: [], visible: [], fileTop: [], notices: [] })
	})

	test("a file with no anchors lands on the top of that file", async () => {
		const { calls, remaining } = await mount({ url: URL_A, headSha: HEAD, file: "assets/logo.png", lines: "3" }, URL_A)
		expect(remaining).toBeNull()
		expect(calls.fileIndex).toEqual([2])
		expect(calls.anchorIndex).toEqual([])
		expect(calls.visible).toEqual([])
		expect(calls.fileTop).toEqual([2, 2, 2, 2, 2, 2])
	})

	test("a diff with no anchors at all still lands on the file", async () => {
		const { calls, remaining } = await mount({ url: URL_A, headSha: HEAD, file: "src/cache.ts", lines: "40" }, URL_A, { diffCommentAnchors: [] })
		expect(remaining).toBeNull()
		expect(calls.fileIndex).toEqual([1])
		expect(calls.fileTop).toEqual([1, 1, 1, 1, 1, 1])
	})

	test("a brief for an older head jumps to the top of the file on its first anchor and says so", async () => {
		const { calls, remaining } = await mount({ url: URL_A, headSha: "old-head", file: "src/cache.ts", lines: "40-58" }, URL_A)
		expect(remaining).toBeNull()
		expect(calls.fileIndex).toEqual([1])
		expect(calls.anchorIndex).toEqual([1])
		expect(calls.visible).toEqual([])
		expect(calls.fileTop).toEqual([1, 1, 1, 1, 1, 1])
		expect(calls.notices).toEqual(["brief is stale; line numbers may be off"])
	})
})
