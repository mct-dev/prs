import { describe, expect, test } from "bun:test"
import { markdownPlainText, renderMarkdown, renderMarkdownUncached, textWidth, type MarkdownRender } from "../src/ui/markdown/index.js"
import { decodeEntities, splitBody } from "../src/ui/markdown/html.js"
import { botSuggestionBody, linkbackBody, plainReviewBody } from "./fixtures/markdownBodies.js"

const text = (render: MarkdownRender) => render.lines.map(markdownPlainText)
const roles = (render: MarkdownRender, needle: string) => render.lines.find((line) => markdownPlainText(line).includes(needle))?.spans.map((span) => span.role) ?? []

describe("markdown renderer: bot comment shapes", () => {
	test("strips HTML comments", () => {
		const lines = text(renderMarkdownUncached(botSuggestionBody, { width: 60 }))
		expect(lines.join("\n")).not.toContain("review-bot")
		expect(lines.join("\n")).not.toContain("<!--")
	})

	test("details wrapping a diff fence stays one collapsible block", () => {
		// CommonMark splits `<details>` at blank lines; the pre-pass must keep
		// the summary, fence and truncation note together.
		const chunks = splitBody(botSuggestionBody)
		const details = chunks.find((chunk) => chunk.kind === "details")
		expect(details?.kind).toBe("details")
		if (details?.kind !== "details") return
		expect(details.summary).toContain("Proposed patch")
		expect(details.body.map((chunk) => (chunk.kind === "markdown" ? chunk.text : "")).join("")).toContain("truncated")
	})

	test("long details fold by default with a hidden-line count", () => {
		const render = renderMarkdownUncached(botSuggestionBody, { width: 60 })
		const summary = text(render).find((line) => line.includes("Proposed patch"))
		expect(summary).toMatch(/^▸ Proposed patch for src\/example\/widget\.ts \(\d+ lines\)$/)
		expect(text(render).join("\n")).not.toContain("items.filter")
		expect(render.detailsCount).toBe(1)
		expect(render.collapsedDetails).toBe(1)
	})

	test("expanded details render the diff with +/- roles and the truncation note", () => {
		const render = renderMarkdownUncached(botSuggestionBody, { width: 60, detailsOpen: true })
		const lines = text(render)
		expect(lines.some((line) => line.startsWith("▾ Proposed patch"))).toBe(true)
		expect(roles(render, "items.filter")).toContain("diffAdd")
		expect(roles(render, "items.length")).toContain("diffRemove")
		expect(roles(render, "@@ -10,7")).toContain("diffHunk")
		expect(lines.some((line) => line.includes("╭─ diff"))).toBe(true)
		expect(lines.some((line) => line.includes("truncated to fit"))).toBe(true)
		expect(render.collapsedDetails).toBe(0)
	})

	test("headings are accented and bold", () => {
		const render = renderMarkdownUncached(botSuggestionBody, { width: 60 })
		const heading = render.lines.find((line) => markdownPlainText(line) === "Suggested change")
		expect(heading?.spans.every((span) => span.role === "heading" && span.bold)).toBe(true)
	})

	test("nested bullets indent with distinct glyphs", () => {
		const lines = text(renderMarkdownUncached(botSuggestionBody, { width: 60 }))
		expect(lines).toContain("• Keep the empty check before rendering")
		expect(lines).toContain("  ◦ nested detail with inline code")
	})

	test("links become label + [n] and land in the link list", () => {
		const render = renderMarkdownUncached(botSuggestionBody, { width: 80 })
		expect(text(render).some((line) => line.includes("the linked change[1] & related notes."))).toBe(true)
		expect(render.links[0]).toMatchObject({ index: 1, url: "https://example.com/owner/repo/pull/42", kind: "link" })
	})

	test("images render as a placeholder with an openable URL", () => {
		const render = renderMarkdownUncached(botSuggestionBody, { width: 60 })
		expect(text(render)).toContain("▣ image: preview screenshot[2]")
		expect(render.links[1]).toMatchObject({ url: "https://example.com/assets/preview.png", kind: "image" })
	})
})

describe("markdown renderer: GitHub HTML subset", () => {
	test("linkback summary with p, ul, b, a, i and table", () => {
		const render = renderMarkdownUncached(linkbackBody, { width: 60 })
		expect(text(render)).toEqual([
			"This change is part of a stack.",
			"",
			"• #41 base change",
			"• #42[1] this change (current)",
			"",
			"Check │ Status",
			"──────┼───────",
			"lint  │ passed",
		])
		expect(render.links).toEqual([{ index: 1, url: "https://example.com/owner/repo/pull/42", label: "#42", kind: "link" }])
	})

	test("inline tags toggle style", () => {
		const render = renderMarkdownUncached("a <b>bold</b> and <code>x</code><br>next", { width: 40 })
		expect(text(render)).toEqual(["a bold and x", "next"])
		const spans = render.lines[0]!.spans
		expect(spans.find((span) => span.text === "bold")?.bold).toBe(true)
		expect(spans.find((span) => span.text === "x")?.role).toBe("code")
	})

	test("decodes entities", () => {
		expect(decodeEntities("a &amp; b &lt;c&gt; &#39;d&#39; &#x2713;")).toBe("a & b <c> 'd' ✓")
	})

	test("tags inside fenced code stay literal", () => {
		const render = renderMarkdownUncached("```html\n<b>raw</b>\n<!-- keep -->\n```", { width: 40 })
		expect(text(render)).toEqual(["╭─ html", "│ <b>raw</b>", "│ <!-- keep -->", "╰─"])
	})
})

describe("markdown renderer: markdown elements", () => {
	test("lists, tasks, quotes, styles, rules and tables", () => {
		const render = renderMarkdownUncached(plainReviewBody, { width: 50 })
		const lines = text(render)
		expect(lines).toContain("1. first thing")
		expect(lines).toContain("• [x] done item")
		expect(lines).toContain("• [ ] open item")
		expect(lines).toContain("│ quoted context line")
		expect(lines).toContain("alpha │ 1")
		expect(roles(render, "quoted context")).toContain("quote")
		const styled = render.lines.find((line) => markdownPlainText(line).startsWith("old idea"))!.spans
		expect(styled.find((span) => span.text === "old idea")?.strike).toBe(true)
		expect(styled.find((span) => span.text === "new idea")?.bold).toBe(true)
		expect(styled.find((span) => span.text === "emphasis")?.italic).toBe(true)
		expect(lines.some((line) => /^─+$/.test(line))).toBe(true)
	})

	test("tables too wide for the pane fall back to key: value rows", () => {
		const body = "| Column one | Column two |\n|---|---|\n| a fairly long value | another long value |"
		expect(text(renderMarkdownUncached(body, { width: 24 }))).toEqual(["Column one: a fairly", "long value", "Column two: another long", "value"])
	})

	test("bare URLs are shortened for display but keep the full target", () => {
		const url = "https://example.com/owner/repo/pull/42/files/0123456789abcdef0123456789abcdef#diff-section"
		const render = renderMarkdownUncached(`see ${url}`, { width: 80 })
		expect(markdownPlainText(render.lines[0]!)).toMatch(/^see example\.com\/owner\/repo\/pull.*…\[1\]$/)
		expect(render.links[0]?.url).toBe(url)
	})

	test("empty body renders a placeholder", () => {
		expect(text(renderMarkdownUncached("  \n", { width: 20 }))).toEqual(["(empty comment)"])
	})
})

describe("markdown renderer: wrapping", () => {
	test("never exceeds the width, counting wide characters", () => {
		const body = "日本語のテキストはとても長いのでちゃんと折り返す必要があります 🎉🎉🎉 and some ascii words to mix in"
		const render = renderMarkdownUncached(body, { width: 16 })
		for (const line of text(render)) expect(textWidth(line)).toBeLessThanOrEqual(16)
		expect(text(render).join("")).toContain("🎉")
	})

	test("list continuation lines hang under the text", () => {
		const lines = text(renderMarkdownUncached("- alpha beta gamma delta epsilon", { width: 14 }))
		expect(lines).toEqual(["• alpha beta", "  gamma delta", "  epsilon"])
	})

	test("renders are cached per body and width", () => {
		const first = renderMarkdown(plainReviewBody, { width: 50 })
		expect(renderMarkdown(plainReviewBody, { width: 50 })).toBe(first)
		expect(renderMarkdown(plainReviewBody, { width: 51 })).not.toBe(first)
	})
})
