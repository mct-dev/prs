import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { type CommentsViewCtx, commentsViewKeymap } from "../src/keymap/commentsView.ts"
import { resolveCommentDiffTarget } from "../src/ui/comments/commentDiffTarget.ts"
import { buildStackedDiffFiles, getStackedDiffCommentAnchors, splitPatchFiles, type DiffThreadPlacement } from "../src/ui/diff.ts"

const patch = `diff --git a/src/example/one.ts b/src/example/one.ts
--- a/src/example/one.ts
+++ b/src/example/one.ts
@@ -1,3 +1,4 @@
 const a = 1
+const b = 2
 const c = 3
 const d = 4
diff --git a/src/example/two.ts b/src/example/two.ts
--- a/src/example/two.ts
+++ b/src/example/two.ts
@@ -10,3 +10,3 @@
 const ten = 10
-const eleven = 11
+const eleven = 110
 const twelve = 12`

const files = splitPatchFiles(patch)
const placements: Record<string, readonly DiffThreadPlacement[]> = {
	"src/example/two.ts": [
		{ key: "k:two:RIGHT:11", side: "RIGHT", line: 11, height: 4 },
		{ key: "k:two:RIGHT:0", side: "RIGHT", line: 0, height: 1 },
	],
}
const stacked = buildStackedDiffFiles(files, "unified", "none", 80, (file) => placements[file.name] ?? [])
const anchors = getStackedDiffCommentAnchors(stacked)

describe("comment → diff target", () => {
	test("a line comment lands on its anchor, with its thread block right below", () => {
		const resolved = resolveCommentDiffTarget({ path: "src/example/two.ts", side: "RIGHT", line: 11, threadKey: "k:two:RIGHT:11" }, stacked, anchors)!
		expect(resolved.fileIndex).toBe(1)
		const anchor = anchors[resolved.anchorIndex!]!
		expect(anchor).toMatchObject({ fileIndex: 1, side: "RIGHT", line: 11 })
		expect(resolved.threadTop).toBe(anchor.renderLine + 1)
		expect(resolved.threadBottom).toBe(anchor.renderLine + 4)
	})

	test("a file-level comment lands on the file block, not a line", () => {
		const resolved = resolveCommentDiffTarget({ path: "src/example/two.ts", side: "RIGHT", line: 0, threadKey: "k:two:RIGHT:0" }, stacked, anchors)!
		expect(resolved).toMatchObject({ fileIndex: 1, anchorIndex: null })
		expect(resolved.threadTop).toBe(stacked[1]!.diffStartLine)
	})

	test("a file outside the diff does not resolve", () => {
		expect(resolveCommentDiffTarget({ path: "src/gone.ts", side: "RIGHT", line: 3, threadKey: "k:gone" }, stacked, anchors)).toBeNull()
	})
})

describe("comments view keys", () => {
	const run = (onReviewComment: boolean, keys: readonly string[]) => {
		const calls: string[] = []
		const ctx: CommentsViewCtx = {
			halfPage: 5,
			scrollBy: () => calls.push("scroll"),
			scrollTo: () => calls.push("scroll"),
			visibleCount: 3,
			canEditSelected: false,
			onReviewComment,
			closeCommentsView: () => calls.push("close"),
			openInBrowser: () => calls.push("browser"),
			refresh: () => calls.push("refresh"),
			newComment: () => calls.push("new"),
			confirmSelection: () => calls.push("confirm"),
			openInDiff: () => calls.push("diff"),
			reply: () => calls.push("reply"),
			editSelected: () => calls.push("edit"),
			deleteSelected: () => calls.push("delete"),
			toggleCard: () => calls.push("card"),
			toggleDetails: () => calls.push("details"),
			openLink: () => calls.push("link"),
		}
		const dispatcher = createDispatcher(commentsViewKeymap, () => ctx)
		for (const key of keys) dispatcher.dispatch(parseKey(key))
		return calls
	}

	test("enter shows a review comment in the diff and replies to a PR comment", () => {
		expect(run(true, ["return", "d", "shift+r"])).toEqual(["diff", "diff", "reply"])
		expect(run(false, ["return"])).toEqual(["confirm"])
	})
})
