import { describe, expect, test } from "bun:test"
import type { PullRequestComment } from "../src/domain.js"
import { commentCard, commentLinks, commentLocation, defaultCardCollapsed, resolveCardState } from "../src/ui/comments/cards.js"
import { cycleDetails, toggleInSet } from "../src/ui/comments/cardState.js"
import { botSuggestionBody } from "./fixtures/markdownBodies.js"

const issueComment = (overrides: Partial<PullRequestComment & { _tag: "comment" }> = {}): PullRequestComment => ({
	_tag: "comment",
	id: "c1",
	author: "reviewer",
	body: "Looks good, one nit below.",
	createdAt: null,
	url: "https://example.com/owner/repo/pull/1#issuecomment-1",
	...overrides,
})

const reviewComment = (overrides: Partial<PullRequestComment & { _tag: "review-comment" }> = {}): PullRequestComment => ({
	_tag: "review-comment",
	id: "r1",
	path: "src/example/widget.ts",
	line: 42,
	side: "RIGHT",
	author: "reviewer",
	body: "Consider an early return here.",
	createdAt: null,
	url: null,
	inReplyTo: null,
	...overrides,
})

const text = (segments: readonly { readonly text: string }[]) => segments.map((segment) => segment.text).join("")
const none = new Set<string>()
const noDetails = new Map<string, boolean>()

describe("comment cards", () => {
	test("location badge distinguishes line, file and general comments", () => {
		expect(commentLocation(reviewComment())).toEqual({ kind: "line", path: "src/example/widget.ts", line: 42 })
		expect(commentLocation(reviewComment({ subjectType: "file", line: 0 }))).toEqual({ kind: "file", path: "src/example/widget.ts" })
		expect(commentLocation(issueComment())).toEqual({ kind: "general" })
		const state = { collapsed: false, detailsOpen: undefined }
		expect(text(commentCard(reviewComment(), { indent: 0, width: 80, state }).meta)).toContain("src/example/widget.ts:42")
		expect(text(commentCard(reviewComment({ subjectType: "file", line: 0 }), { indent: 0, width: 80, state }).meta)).toContain("widget.ts (file)")
		expect(text(commentCard(issueComment(), { indent: 0, width: 80, state }).meta)).toContain("general")
	})

	test("meta shows bot, edited, outdated and resolved badges", () => {
		const comment = reviewComment({ authorIsBot: true, editedAt: new Date(), outdated: true, resolved: true })
		const meta = text(commentCard(comment, { indent: 0, width: 100, state: { collapsed: false, detailsOpen: undefined } }).meta)
		expect(meta).toContain("[bot]")
		expect(meta).toContain("edited")
		expect(meta).toContain("outdated")
		expect(meta).toContain("resolved")
	})

	test("bot and long comments fold by default; short human comments don't", () => {
		expect(defaultCardCollapsed(issueComment({ authorIsBot: true }), 60)).toBe(true)
		expect(defaultCardCollapsed(issueComment(), 60)).toBe(false)
		const long = Array.from({ length: 20 }, (_, index) => `- point ${index}`).join("\n")
		expect(defaultCardCollapsed(issueComment({ body: long }), 60)).toBe(true)
	})

	test("a folded bot card shows a preview and a hidden-line count", () => {
		const bot = issueComment({ body: botSuggestionBody, authorIsBot: true })
		const state = resolveCardState(bot, 60, none, noDetails)
		expect(state.collapsed).toBe(true)
		const card = commentCard(bot, { indent: 0, width: 62, state })
		expect(card.hiddenLines).toBeGreaterThan(0)
		expect(card.body).toHaveLength(3)
		expect(text(card.body.at(-1)!.segments)).toContain(`▸ ${card.hiddenLines} lines hidden`)
		expect(text(card.meta).startsWith("▸")).toBe(true)
	})

	test("toggling expands the card and lists its links as footnotes", () => {
		const bot = issueComment({ body: botSuggestionBody, authorIsBot: true })
		const state = resolveCardState(bot, 60, toggleInSet(none, bot.id), noDetails)
		expect(state.collapsed).toBe(false)
		const lines = commentCard(bot, { indent: 0, width: 62, state }).body.map((line) => text(line.segments))
		expect(lines.some((line) => line.includes("hidden"))).toBe(false)
		expect(lines.some((line) => line.trim().startsWith("[1] example.com/owner/repo/pull/42"))).toBe(true)
		expect(lines.some((line) => line.trim().startsWith("[2] "))).toBe(true)
	})

	test("details cycle from auto to open to folded", () => {
		const once = cycleDetails(noDetails, "x")
		expect(once.get("x")).toBe(true)
		expect(cycleDetails(once, "x").get("x")).toBe(false)
		const bot = issueComment({ body: botSuggestionBody, authorIsBot: true })
		const open = commentCard(bot, { indent: 0, width: 62, state: { collapsed: false, detailsOpen: true } }).body.map((line) => text(line.segments))
		expect(open.some((line) => line.includes("items.filter"))).toBe(true)
	})

	test("link numbering is stable regardless of folding", () => {
		const bot = issueComment({ body: botSuggestionBody })
		expect(commentLinks(bot).map((link) => link.index)).toEqual([1, 2])
		expect(commentLinks(bot)[1]?.kind).toBe("image")
	})
})
