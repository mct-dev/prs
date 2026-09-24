import { describe, expect, test } from "bun:test"
import { buildStackedDiffFiles, getDiffCommentAnchors, getStackedDiffCommentAnchors, patchRenderableLineCount, splitPatchFiles, type DiffView } from "../src/ui/diff.ts"
import { segmentPatch, type PatchCut } from "../src/ui/diff/segments.ts"

const patch = `diff --git a/src/example/list.ts b/src/example/list.ts
--- a/src/example/list.ts
+++ b/src/example/list.ts
@@ -8,6 +8,8 @@ export const render = () => {
 const first = 1
-const second = 2
-const third = 3
+const second = 20
+const third = 30
+const fourth = 40
 const fifth = 5
+const sixth = 6
 const seventh = 7
 const eighth = 8
@@ -96,5 +98,4 @@ const tail = () => {
 const ninetySix = 96
-const ninetySeven = 97
-const ninetyEight = 98
+const ninetyEight = 980
 const ninetyNine = 99
 const hundred = 100
\\ No newline at end of file`

const [file] = splitPatchFiles(patch)
const views: readonly DiffView[] = ["unified", "split"]

// Every line a thread could be anchored to, on either side.
const allCuts = (view: DiffView): PatchCut[] => getDiffCommentAnchors(file!, view).map((anchor) => ({ side: anchor.side, line: anchor.line }))

const rows = (view: DiffView, patches: readonly string[]) => {
	let offset = 0
	return patches.flatMap((piece) => {
		const anchors = getDiffCommentAnchors({ ...file!, patch: piece }, view).map((anchor) => `${anchor.side}:${anchor.line}:${anchor.kind}@${offset + anchor.renderLine}`)
		offset += patchRenderableLineCount(piece, view, "none", 120)
		return anchors
	})
}

describe("diff segments", () => {
	for (const view of views) {
		test(`${view}: cutting anywhere keeps heights and line numbers`, () => {
			const whole = patchRenderableLineCount(file!.patch, view, "none", 120)
			const wholeRows = rows(view, [file!.patch])
			for (const cut of allCuts(view)) {
				const { patches, placements } = segmentPatch(file!.patch, [cut], view)
				expect(placements[0]).not.toBeNull()
				expect(patches.reduce((total, piece) => total + patchRenderableLineCount(piece, view, "none", 120), 0)).toBe(whole)
				expect(rows(view, patches)).toEqual(wholeRows)
			}
			const everywhere = segmentPatch(file!.patch, allCuts(view), view)
			expect(everywhere.patches.length).toBeGreaterThan(3)
			expect(rows(view, everywhere.patches)).toEqual(wholeRows)
		})
	}

	test("split view cuts after the whole change block", () => {
		const { patches } = segmentPatch(file!.patch, [{ side: "LEFT", line: 9 }], "split")
		expect(patches[0]!.split("\n").at(-1)).toBe("+const fourth = 40")
		const unified = segmentPatch(file!.patch, [{ side: "LEFT", line: 9 }], "unified")
		expect(unified.patches[0]!.split("\n").at(-1)).toBe("-const second = 2")
	})

	test("a no-newline marker stays with its line", () => {
		const { patches } = segmentPatch(file!.patch, [{ side: "RIGHT", line: 100 }], "unified")
		expect(patches.at(-1)!.split("\n").slice(-2)).toEqual([" const hundred = 100", "\\ No newline at end of file"])
	})

	test("unknown lines are not placed and leave the patch untouched", () => {
		const result = segmentPatch(file!.patch, [{ side: "RIGHT", line: 500 }], "unified")
		expect(result).toEqual({ patches: [file!.patch], placements: [null] })
	})
})

describe("stacked geometry with thread rows", () => {
	const files = splitPatchFiles(`${patch}\ndiff --git a/two.ts b/two.ts\n--- a/two.ts\n+++ b/two.ts\n@@ -1,1 +1,2 @@\n one\n+two`)

	test("zero threads: one segment holding the original patch", () => {
		const stacked = buildStackedDiffFiles(files, "unified", "none", 120)
		expect(stacked[0]!.sections).toEqual([{ kind: "diff", segmentIndex: 0, patch: files[0]!.patch, top: 2, height: stacked[0]!.diffHeight }])
		expect(stacked[1]!.headerLine).toBe(2 + stacked[0]!.diffHeight + 1)
	})

	test("thread rows push later lines, anchors and files down", () => {
		const plain = buildStackedDiffFiles(files, "unified", "none", 120)
		const threads = buildStackedDiffFiles(files, "unified", "none", 120, (_, index) =>
			index === 0
				? [
						{ key: "line", side: "RIGHT", line: 13, height: 3 },
						{ key: "file", side: "RIGHT", line: 0, height: 1 },
						{ key: "gone", side: "LEFT", line: 400, height: 1 },
					]
				: [],
		)
		const [first] = threads
		expect(first!.sections.map((section) => section.kind)).toEqual(["threads", "diff", "threads", "diff"])
		const fileBlock = first!.sections[0]!
		expect(fileBlock).toMatchObject({ kind: "threads", placement: "file", keys: ["file", "gone"], top: 2, height: 2 })
		expect(first!.diffHeight).toBe(plain[0]!.diffHeight + 5)
		expect(threads[1]!.headerLine).toBe(plain[1]!.headerLine + 5)

		const before = getStackedDiffCommentAnchors(plain)
		const after = getStackedDiffCommentAnchors(threads)
		expect(after.map((anchor) => `${anchor.path}:${anchor.side}:${anchor.line}`)).toEqual(before.map((anchor) => `${anchor.path}:${anchor.side}:${anchor.line}`))
		const shift = (line: number) =>
			after.find((anchor) => anchor.side === "RIGHT" && anchor.line === line)!.renderLine - before.find((anchor) => anchor.side === "RIGHT" && anchor.line === line)!.renderLine
		expect(shift(13)).toBe(2)
		expect(shift(14)).toBe(5)
		const lineBlock = first!.sections[2]!
		expect(lineBlock.top).toBe(after.find((anchor) => anchor.side === "RIGHT" && anchor.line === 13)!.renderLine + 1)
		expect(after.find((anchor) => anchor.side === "RIGHT" && anchor.line === 14)).toMatchObject({ segmentIndex: 1, localRenderLine: 0 })
	})
})
