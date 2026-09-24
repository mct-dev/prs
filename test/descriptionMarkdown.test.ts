import { describe, expect, test } from "bun:test"
import { bodyPreview, clipDescription, DESCRIPTION_PLAIN_TEXT_NOTE, DESCRIPTION_TRUNCATED_NOTE } from "../src/ui/DetailsPane.tsx"
import { issueReferenceUrl } from "../src/ui/inlineSegments.js"
import { MARKDOWN_MAX_CHARS, markdownPlainText, renderMarkdownUncached, type MarkdownRender } from "../src/ui/markdown/index.js"
import { prDescriptionBody } from "./fixtures/markdownBodies.js"

const text = (render: MarkdownRender) => render.lines.map(markdownPlainText)
const lineWith = (render: MarkdownRender, needle: string) => render.lines.find((line) => markdownPlainText(line).includes(needle))
const previewText = (lines: ReturnType<typeof bodyPreview>) => lines.map((line) => line.segments.map((segment) => segment.text).join(""))

describe("markdown renderer: PR description shapes", () => {
	const render = renderMarkdownUncached(prDescriptionBody, { width: 60, boldHeadings: true })
	const all = text(render).join("\n")

	test("HTML comments are hidden", () => {
		expect(all).not.toContain("SOME_BOT_SUMMARY")
		expect(all).not.toContain("<!--")
	})

	test("--- renders as a thin rule", () => {
		const rule = render.lines.find((line) => markdownPlainText(line).startsWith("───"))
		expect(rule?.spans.map((part) => part.role)).toEqual(["frame"])
		expect(all).not.toMatch(/^---$/m)
	})

	test("GitHub alerts get a styled label inside a dim bar", () => {
		expect(all).not.toContain("[!NOTE]")
		expect(all).not.toContain("[!WARNING]")
		const note = lineWith(render, "ⓘ Note")
		expect(note?.spans.map((part) => part.role)).toEqual(["frame", "alertNote"])
		expect(note?.spans[1]?.bold).toBe(true)
		expect(lineWith(render, "⚠ Warning")?.spans[1]?.role).toBe("alertWarning")
		expect(markdownPlainText(lineWith(render, "depends on")!)).toBe("│ This PR depends on #120 landing first.")
	})

	test("every alert kind is recognised, case-insensitively", () => {
		const kinds = ["note", "Tip", "IMPORTANT", "warning", "caution"]
		const lines = text(renderMarkdownUncached(kinds.map((kind) => `> [!${kind}]\n> body`).join("\n\n"), { width: 40 }))
		expect(lines.filter((line) => /^│ . (Note|Tip|Important|Warning|Caution)$/.test(line))).toHaveLength(5)
	})

	test("plain blockquotes are unchanged", () => {
		expect(text(renderMarkdownUncached("> [!nope] just text", { width: 40 }))).toEqual(["│ [!nope] just text"])
	})

	test("<sup> and <sub> never glue onto the word", () => {
		expect(all).toContain("Built by a bot")
		expect(all).not.toContain("^Built")
		expect(all).toContain("Removes the old path¹")
		expect(all).not.toMatch(/<\/?su[pb]>/)
		const inline = (body: string) => text(renderMarkdownUncached(body, { width: 60 }))
		expect(inline("H<sub>2</sub>O and x<sup>(n+1)</sup>")).toEqual(["H₂O and x^(n+1)"])
		expect(inline("E = mc<sup>2</sup>, see note<sup>12</sup>")).toEqual(["E = mc², see note¹²"])
		expect(inline("version<sup>beta</sup> and log<sub>base</sub>")).toEqual(["version^beta and log_base"])
		expect(inline("<sup>small print</sup>")).toEqual(["small print"])
		// Block-level HTML goes through the same rule.
		expect(inline("<p>Total<sup>3</sup> and v<sup>rc</sup></p>")).toEqual(["Total³ and v^rc"])
	})

	test("<a><picture><img></picture></a> collapses to one linked placeholder", () => {
		expect(all).not.toMatch(/<\/?(?:a|picture|source|img)\b/)
		const badge = lineWith(render, "Badge")
		expect(markdownPlainText(badge!)).toBe("▣ image: Badge[1]")
		expect(badge?.spans[0]).toMatchObject({ role: "image", url: "https://example.com/ci" })
		// Multi-line HTML must not leak `[`, `](...)` or an indented code block.
		expect(markdownPlainText(lineWith(render, "Coverage")!)).toBe("▣ image: Coverage[2]")
		expect(all).not.toContain("╭─")
		expect(render.links.slice(0, 2).map((link) => link.url)).toEqual(["https://example.com/ci", "https://example.com/coverage"])
	})

	test("a picture with no img falls back to its first source", () => {
		const lines = text(renderMarkdownUncached('<picture><source srcset="https://example.com/a.svg 1x"></picture>', { width: 40 }))
		expect(lines).toEqual(["▣ image[1]"])
	})

	test("markdown linked images point at the link, not the image", () => {
		const render = renderMarkdownUncached("[![Build](https://example.com/b.svg)](https://example.com/build)", { width: 40 })
		expect(text(render)).toEqual(["▣ image: Build[1]"])
		expect(render.links).toEqual([{ index: 1, url: "https://example.com/build", label: "Build", kind: "link" }])
	})

	test("a bold-only paragraph reads as a heading when boldHeadings is on", () => {
		expect(lineWith(render, "Changes")?.spans).toEqual([{ text: "Changes", role: "heading", bold: true }])
		expect(renderMarkdownUncached("**Testing:**", { width: 40, boldHeadings: true }).lines[0]?.spans[0]?.role).toBe("heading")
	})

	test("comments (no boldHeadings) keep a bold-only paragraph as bold text", () => {
		expect(renderMarkdownUncached("**LGTM**", { width: 40 }).lines[0]?.spans).toEqual([{ text: "LGTM", role: "text", bold: true }])
	})

	test("inline bold stays inline", () => {
		const line = renderMarkdownUncached("**Note:** keep this", { width: 40 }).lines[0]!
		expect(line.spans.map((part) => part.role)).toEqual(["text", "text"])
		const listed = renderMarkdownUncached("- **Item**", { width: 40 }).lines[0]!
		expect(listed.spans.some((part) => part.role === "heading")).toBe(false)
	})

	test("tool attribution trailers are dimmed but stay clickable", () => {
		const footer = lineWith(render, "Generated with")
		expect(footer?.spans.every((part) => part.role === "muted")).toBe(true)
		expect(footer?.spans.some((part) => part.url === "https://example.com/claude-code")).toBe(true)
		const session = lineWith(render, "session_abc")
		expect(session?.spans.every((part) => part.role === "muted")).toBe(true)
		expect(session?.spans[0]?.url).toBe("https://example.com/code/session_abc")
	})

	test("only a one-line, emoji-led footer counts as a generated trailer", () => {
		const prose = renderMarkdownUncached("Generated by the nightly job, this report lists failures.", { width: 80 })
		expect(prose.lines[0]?.spans[0]?.role).toBe("text")
		const multi = renderMarkdownUncached("🤖 Generated with a script\nand then a real second line of text", { width: 80 })
		expect(multi.lines.every((line) => line.spans.every((part) => part.role !== "muted"))).toBe(true)
		const footer = renderMarkdownUncached("Body.\n\n✨ Generated by Tool", { width: 80 })
		expect(lineWith(footer, "Tool")?.spans.every((part) => part.role === "muted")).toBe(true)
	})

	test("reference-style links resolve inside alerts", () => {
		const render = renderMarkdownUncached("> [!NOTE]\n> See the [design doc][doc].\n\n[doc]: https://example.com/design", { width: 60 })
		const line = lineWith(render, "design doc")!
		expect(markdownPlainText(line)).not.toContain("[doc]")
		expect(line.spans.find((part) => part.text.includes("design doc"))).toMatchObject({ role: "link", url: "https://example.com/design" })
	})

	test("git trailers dim; a lone URL paragraph does not", () => {
		const trailers = renderMarkdownUncached("Body text.\n\nCo-Authored-By: alice <alice@example.com>", { width: 60 })
		expect(lineWith(trailers, "Co-Authored-By")?.spans.every((part) => part.role === "muted")).toBe(true)
		expect(lineWith(trailers, "Body")?.spans[0]?.role).toBe("text")
		const bare = renderMarkdownUncached("See this:\n\nhttps://example.com/page", { width: 60 })
		expect(lineWith(bare, "example.com/page")?.spans[0]?.role).toBe("link")
	})
})

describe("markdown renderer: issue references", () => {
	test("#123 is styled and links when a repository is given", () => {
		const render = renderMarkdownUncached("Fixes #123.", { width: 40, issueReferenceRepository: "my-org/widgets" })
		expect(render.lines[0]?.spans).toEqual([
			{ text: "Fixes ", role: "text" },
			{ text: "#123", role: "issueRef", url: issueReferenceUrl("my-org/widgets", 123) },
			{ text: ".", role: "text" },
		])
	})

	test("without a repository the reference is left as plain text", () => {
		const spans = renderMarkdownUncached("Fixes #123", { width: 40 }).lines[0]!.spans
		expect(spans).toEqual([{ text: "Fixes #123", role: "text" }])
	})

	test("code spans, links, fragments and words are left alone", () => {
		const render = renderMarkdownUncached("`#1` [see #2](https://example.com/#3) abc#4 ##5", { width: 80, issueReferenceRepository: "my-org/widgets" })
		expect(render.lines[0]?.spans.some((part) => part.role === "issueRef")).toBe(false)
	})
})

describe("markdown renderer: table modes", () => {
	const wide = "| Name | Description | Owner |\n|---|---|---|\n| widget-cache-service | Caches every widget response for the dashboard | alice |"

	test("auto falls back to header: value lines", () => {
		expect(text(renderMarkdownUncached(wide, { width: 40 }))).toContain("Name: widget-cache-service")
	})

	test("truncate keeps columns and clips cells to one line", () => {
		const lines = text(renderMarkdownUncached(wide, { width: 40, tableMode: "truncate" }))
		expect(lines).toHaveLength(3)
		expect(lines[1]).toContain("─┼─")
		expect(lines[2]).toContain("widget-cach…")
		for (const line of lines) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(40)
	})

	test("wrap keeps columns and wraps cells onto extra rows", () => {
		const lines = text(renderMarkdownUncached(wide, { width: 40, tableMode: "wrap" }))
		expect(lines.length).toBeGreaterThan(3)
		expect(lines[1]).toContain("─┼─")
		expect(lines.join("\n")).toContain("dashboard")
		for (const line of lines) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(40)
	})
})

describe("bodyPreview through the markdown renderer", () => {
	test("renders the description cleanly and within the line limit", () => {
		const lines = previewText(bodyPreview(prDescriptionBody, 60, 1_000))
		const all = lines.join("\n")
		for (const raw of ["<!--", "[!NOTE]", "<sup>", "<picture>", "<img", "**Changes**", "\n---\n"]) expect(all).not.toContain(raw)
		expect(all).toContain("ⓘ Note")
		// The pane has no footnote list, so no `[n]` markers.
		expect(all).not.toMatch(/\[\d+\]/)
		expect(bodyPreview(prDescriptionBody, 60, 5)).toHaveLength(5)
	})

	test("issue references link to the item's repository", () => {
		const segments = bodyPreview("Fixes #123", 40, 5, { issueReferenceRepository: "my-org/widgets" })[0]!.segments
		expect(segments.find((segment) => segment.text === "#123")).toMatchObject({ url: issueReferenceUrl("my-org/widgets", 123), underline: true })
	})

	test("code spans stay styled without backticks", () => {
		const all = previewText(bodyPreview("Use `Cache.get` here", 40, 5)).join("\n")
		expect(all).toBe("Use Cache.get here")
	})

	test("empty and comment-only bodies say there is no description", () => {
		expect(previewText(bodyPreview("", 40, 5))).toEqual(["No description."])
		expect(previewText(bodyPreview("<!-- only a marker -->", 40, 5))).toEqual(["No description."])
	})

	test("details blocks are expanded since the pane cannot toggle them", () => {
		const body = `<details><summary>More</summary>\n\n${Array.from({ length: 10 }, (_, index) => `line ${index}`).join("\n\n")}\n\n</details>`
		expect(previewText(bodyPreview(body, 40, 100)).join("\n")).toContain("line 9")
	})

	test("trailing blank lines are not counted", () => {
		expect(previewText(bodyPreview("one\n\ntwo", 40, 20))).toEqual(["one", "", "two"])
		expect(previewText(bodyPreview("one\n\n\n\n", 40, 20))).toEqual(["one"])
	})

	test("a body that is only a comment and a rule has no description", () => {
		expect(previewText(bodyPreview("<!-- template -->\n\n---\n\n", 40, 6))).toEqual(["No description."])
		expect(previewText(bodyPreview("---\n\n***", 40, 6))).toEqual(["No description."])
	})

	test("a collapsed preview drops block gaps but keeps them before headings, rules and tables", () => {
		const body = "Intro text.\n\n- one\n- two\n\nMore text.\n\n## Next\n\nAfter.\n\n---\n\n| A | B |\n|---|---|\n| 1 | 2 |"
		const compact = previewText(bodyPreview(body, 40, 12))
		expect(compact.slice(0, 5)).toEqual(["Intro text.", "• one", "• two", "More text.", ""])
		expect(compact[5]).toBe("Next")
		expect(compact[6]).toBe("After.")
		expect(compact[7]).toBe("")
		expect(compact[8]).toMatch(/^─+$/)
		expect(compact[9]).toBe("")
		expect(compact[10]).toContain("A")
		// The full-height view keeps every separator.
		expect(previewText(bodyPreview(body, 40, 1_000))[1]).toBe("")
	})

	test("collapsed preview height matches what it renders", () => {
		for (const limit of [3, 6, 12, 40]) expect(bodyPreview(prDescriptionBody, 60, limit).length).toBeLessThanOrEqual(limit)
		// The gap after the summary paragraph is dropped; the one before the rule stays.
		expect(previewText(bodyPreview(prDescriptionBody, 60, 6)).slice(0, 4)).toEqual(["Summary", "Adds the widget cache. Fixes #123 and see src/cache.ts.", "", "─".repeat(40)])
	})
})

describe("bodyPreview: very long descriptions", () => {
	const paragraph = (index: number) => `Paragraph ${index} talks about the **widget cache** in some detail for alice.`
	const long = Array.from({ length: 600 }, (_, index) => paragraph(index)).join("\n\n")

	test("a body over the budget renders its head as markdown, not plain text", () => {
		expect(long.length).toBeGreaterThan(MARKDOWN_MAX_CHARS)
		const all = previewText(bodyPreview(long, 80, 1_000)).join("\n")
		expect(all).not.toContain("plain text")
		expect(all).not.toContain("**")
		expect(all).toContain("Paragraph 0 talks")
		expect(all).toContain(DESCRIPTION_TRUNCATED_NOTE)
	})

	test("the clip lands on a paragraph break under the budget", () => {
		const clipped = clipDescription(long)
		expect(clipped.length).toBeLessThanOrEqual(MARKDOWN_MAX_CHARS)
		expect(clipped).toMatch(/for alice\.\n\n\*… description truncated\*$/)
		expect(clipDescription("short")).toBe("short")
	})

	test("an open code fence at the cut is closed", () => {
		const fenced = `Intro.\n\n\`\`\`ts\n${Array.from({ length: 3_000 }, (_, index) => `const value${index} = ${index}\n`).join("\n")}\`\`\``
		const clipped = clipDescription(fenced)
		expect(clipped).toMatch(/\n```\n\n\*… description truncated\*$/)
		const lines = previewText(bodyPreview(fenced, 80, 5))
		expect(lines.slice(0, 3)).toEqual(["Intro.", "╭─ ts", "│ const value0 = 0"])
	})

	test("a body that still trips a guard falls back with a description label", () => {
		const deep = `${">".repeat(40)} nested`
		expect(previewText(bodyPreview(deep, 80, 10))[0]).toBe(DESCRIPTION_PLAIN_TEXT_NOTE)
	})
})
