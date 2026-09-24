import { describe, expect, test } from "bun:test"
import { bodyPreview } from "../src/ui/DetailsPane.tsx"
import { issueReferenceUrl } from "../src/ui/inlineSegments.js"
import { markdownPlainText, renderMarkdownUncached, type MarkdownRender } from "../src/ui/markdown/index.js"
import { prDescriptionBody } from "./fixtures/markdownBodies.js"

const text = (render: MarkdownRender) => render.lines.map(markdownPlainText)
const lineWith = (render: MarkdownRender, needle: string) => render.lines.find((line) => markdownPlainText(line).includes(needle))
const previewText = (lines: ReturnType<typeof bodyPreview>) => lines.map((line) => line.segments.map((segment) => segment.text).join(""))

describe("markdown renderer: PR description shapes", () => {
	const render = renderMarkdownUncached(prDescriptionBody, { width: 60 })
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

	test("<sup> and <sub> become plain text", () => {
		expect(all).toContain("Built by a bot")
		expect(all).toContain("Removes the old path1")
		expect(all).not.toMatch(/<\/?su[pb]>/)
		expect(text(renderMarkdownUncached("H<sub>2</sub>O", { width: 40 }))).toEqual(["H2O"])
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

	test("a bold-only paragraph reads as a heading", () => {
		expect(lineWith(render, "Changes")?.spans).toEqual([{ text: "Changes", role: "heading", bold: true }])
		expect(renderMarkdownUncached("**Testing:**", { width: 40 }).lines[0]?.spans[0]?.role).toBe("heading")
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

	test("without a repository the reference is styled but not linked", () => {
		const spans = renderMarkdownUncached("Fixes #123", { width: 40 }).lines[0]!.spans
		expect(spans[1]).toEqual({ text: "#123", role: "issueRef" })
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
		const lines = bodyPreview("one\n\ntwo", 40, 2)
		expect(previewText(lines)).toEqual(["one"])
	})
})
