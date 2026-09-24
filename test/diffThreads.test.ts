import { describe, expect, test } from "bun:test"
import type { PullRequestReviewComment } from "../src/domain.ts"
import { buildStackedDiffFiles, getStackedDiffCommentAnchors, splitPatchFiles } from "../src/ui/diff.ts"
import {
	diffThreadExpanded,
	diffThreadKeysAtCursor,
	diffThreadLines,
	diffThreadPlacements,
	diffThreadsInFiles,
	diffThreadsByPath,
	toggleAllDiffThreads,
	toggleDiffThreads,
} from "../src/ui/diff/threads.ts"
import { textWidth } from "../src/ui/markdown/index.ts"

const diffKey = "owner/repo#7@abc"
const path = "src/example/list.ts"

const comment = (id: string, overrides: Partial<PullRequestReviewComment> = {}): PullRequestReviewComment => ({
	id,
	path,
	line: 13,
	side: "RIGHT",
	author: "reviewer",
	body: "Consider **renaming** this constant.",
	createdAt: null,
	url: null,
	inReplyTo: null,
	...overrides,
})

const key = (location: Pick<PullRequestReviewComment, "path" | "side" | "line">) => `${diffKey}:${location.path}:${location.side}:${location.line}`

const threads: Record<string, readonly PullRequestReviewComment[]> = {
	[key({ path, side: "RIGHT", line: 13 })]: [comment("a"), comment("b", { author: "author", body: "Done, thanks!", inReplyTo: "a" })],
	[key({ path, side: "RIGHT", line: 9 })]: [
		comment("c", { line: 9, author: "lint-bot", authorIsBot: true, body: "<details><summary>3 warnings</summary>\n\n- one\n- two\n- three\n</details>" }),
	],
	[key({ path, side: "LEFT", line: 40 })]: [comment("d", { line: 40, side: "LEFT", outdated: true, body: "This moved." })],
	[key({ path, side: "RIGHT", line: 0 })]: [comment("e", { line: 0, subjectType: "file", resolved: true, body: "Whole-file note." })],
	[`other/repo#1@def:${path}:RIGHT:13`]: [comment("x")],
}

const patch = `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
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
 const eighth = 8`

const byPath = diffThreadsByPath(diffKey, threads)
const fileThreads = byPath.get(path) ?? []
const find = (id: string) => fileThreads.find((thread) => thread.comments[0]?.id === id)!

describe("diff threads", () => {
	test("groups this diff's threads by path and sends file-level and outdated ones to the file block", () => {
		expect([...byPath.keys()]).toEqual([path])
		expect(fileThreads.map((thread) => [thread.comments[0]!.id, thread.fileLevel])).toEqual([
			["e", true],
			["c", false],
			["a", false],
			["d", true],
		])
	})

	test("open threads start expanded; bot, outdated and resolved start as a marker", () => {
		const none = new Set<string>()
		expect(diffThreadExpanded(find("a"), none)).toBe(true)
		expect(diffThreadExpanded(find("c"), none)).toBe(false)
		expect(diffThreadExpanded(find("d"), none)).toBe(false)
		expect(diffThreadExpanded(find("e"), none)).toBe(false)
		expect(diffThreadExpanded(find("a"), new Set([find("a").key]))).toBe(false)
	})

	test("a collapsed thread is one line: marker, author, snippet, replies", () => {
		const [line, ...rest] = diffThreadLines(find("a"), { expanded: false, width: 60 })
		expect(rest).toEqual([])
		const text = line!.segments.map((segment) => segment.text).join("")
		expect(text).toBe("◆ reviewer  Consider renaming this constant.  +1 reply")
		const narrow = diffThreadLines(find("a"), { expanded: false, width: 30 })[0]!
		expect(textWidth(narrow.segments.map((segment) => segment.text).join(""))).toBeLessThanOrEqual(30)
	})

	test("dimmed threads are labeled", () => {
		const text = (id: string) =>
			diffThreadLines(find(id), { expanded: false, width: 80 })[0]!
				.segments.map((segment) => segment.text)
				.join("")
		expect(text("d")).toContain("outdated")
		expect(text("e")).toContain("✓ resolved")
		expect(text("c")).toContain("[bot]")
	})

	test("an expanded thread renders every comment inside a rail and fits the width", () => {
		const lines = diffThreadLines(find("a"), { expanded: true, width: 40 })
		const texts = lines.map((line) => line.segments.map((segment) => segment.text).join(""))
		expect(texts[0]).toStartWith("╭ ◆ reviewer")
		expect(texts).toContain("│ Consider renaming this constant.")
		expect(texts.some((text) => text.startsWith("├ ↳ author"))).toBe(true)
		expect(texts.at(-1)).toBe("╰ c collapse")
		for (const text of texts) expect(textWidth(text)).toBeLessThanOrEqual(40)
	})

	test("placements reserve exactly the rendered height", () => {
		const toggled = new Set<string>()
		const placements = diffThreadPlacements(fileThreads, toggled, 50)
		for (const [index, placement] of placements.entries()) {
			const thread = fileThreads[index]!
			expect(placement.height).toBe(diffThreadLines(thread, { expanded: diffThreadExpanded(thread, toggled), width: 50 }).length)
			expect(placement.line).toBe(thread.fileLevel ? 0 : thread.line)
		}
	})

	test("c picks the thread at the cursor, else the nearest block in the file", () => {
		const files = splitPatchFiles(patch)
		const stacked = buildStackedDiffFiles(files, "unified", "none", 80, () => diffThreadPlacements(fileThreads, new Set(), 77))
		const anchors = getStackedDiffCommentAnchors(stacked)
		const at = (side: "LEFT" | "RIGHT", line: number) => anchors.find((anchor) => anchor.side === side && anchor.line === line)!
		expect(diffThreadKeysAtCursor(stacked, at("RIGHT", 13), diffKey)).toEqual([find("a").key])
		expect(diffThreadKeysAtCursor(stacked, at("RIGHT", 14), diffKey)).toEqual([find("a").key])
		expect(diffThreadKeysAtCursor(stacked, at("RIGHT", 8), diffKey)).toEqual([find("e").key, find("d").key])
		expect(diffThreadKeysAtCursor(stacked, null, diffKey)).toEqual([])
	})

	test("toggling a block moves every thread in it to one state", () => {
		const keys = [find("e").key, find("a").key]
		const once = toggleDiffThreads(fileThreads, keys, new Set())
		expect(diffThreadExpanded(find("e"), once)).toBe(true)
		expect(diffThreadExpanded(find("a"), once)).toBe(true)
		const twice = toggleDiffThreads(fileThreads, keys, once)
		expect(diffThreadExpanded(find("e"), twice)).toBe(false)
		expect(diffThreadExpanded(find("a"), twice)).toBe(false)
	})

	test("shift+c collapses everything when anything is open, then expands everything", () => {
		const collapsed = toggleAllDiffThreads(fileThreads, new Set())
		expect(fileThreads.every((thread) => !diffThreadExpanded(thread, collapsed))).toBe(true)
		const expanded = toggleAllDiffThreads(fileThreads, collapsed)
		expect(fileThreads.every((thread) => diffThreadExpanded(thread, expanded))).toBe(true)
	})

	test("shift+c ignores threads on files the diff does not show", () => {
		const stray = diffThreadsByPath(diffKey, { ...threads, [`${diffKey}:src/gone.ts:RIGHT:3`]: [comment("g", { path: "src/gone.ts", line: 3 })] })
		const stacked = buildStackedDiffFiles(splitPatchFiles(patch), "unified", "none", 80)
		const visible = diffThreadsInFiles(stray, stacked)
		expect(visible.map((thread) => thread.comments[0]!.id)).toEqual(["e", "c", "a", "d"])
		const collapsed = toggleAllDiffThreads(visible, new Set([find("a").key]))
		expect(visible.every((thread) => diffThreadExpanded(thread, collapsed))).toBe(true)
	})
})
