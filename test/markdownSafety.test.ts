import { describe, expect, test } from "bun:test"
import { markdownPlainText, renderMarkdownUncached, type MarkdownRender } from "../src/ui/markdown/index.js"
import { decodeEntities } from "../src/ui/markdown/html.js"
import { MAX_NEST_DEPTH, PLAIN_TEXT_NOTE } from "../src/ui/markdown/render.js"

// oxlint-disable-next-line no-control-regex -- intentional: untrusted text is scrubbed of terminal controls
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/
const ESC = "\u001b"

const allText = (render: MarkdownRender) => render.lines.flatMap((line) => line.spans.map((span) => span.text)).join("")
const allUrls = (render: MarkdownRender) => [...render.links.map((link) => link.url), ...render.lines.flatMap((line) => line.spans.flatMap((span) => (span.url ? [span.url] : [])))]
const expectClean = (render: MarkdownRender) => {
	expect(CONTROL.test(allText(render))).toBe(false)
	for (const url of allUrls(render)) expect(CONTROL.test(url)).toBe(false)
}

describe("markdown renderer: control characters", () => {
	test("a link whose target carries ESC keeps its label but drops the target", () => {
		const render = renderMarkdownUncached(`[x](http://a/${ESC}[2J) after`, { width: 60 })
		expectClean(render)
		expect(render.lines.map(markdownPlainText).join("\n")).toContain("x")
	})

	test("numeric entities never decode to control characters", () => {
		expect(decodeEntities("&#27;[2J")).toBe("[2J")
		expect(decodeEntities("&#x1b;&#x9b;&#127;")).toBe("")
		expect(decodeEntities("a&#10;b&#9;c")).toBe("a\nb\tc")
		expectClean(renderMarkdownUncached("before &#27;[2J after", { width: 60 }))
	})

	test("raw ESC inside a code fence is stripped", () => {
		const render = renderMarkdownUncached(["```", `echo ${ESC}[31mred${ESC}]8;;http://x${ESC}\\`, "```"].join("\n"), { width: 60 })
		expectClean(render)
		expect(allText(render)).toContain("echo [31mred")
	})

	test("HTML anchors and images with control characters in their targets", () => {
		const render = renderMarkdownUncached(`<a href="http://a/&#27;x">label</a> <img src="http://a/${ESC}.png" alt="pic">`, { width: 60 })
		expectClean(render)
		expect(render.links.map((link) => link.url)).toEqual(["http://a/x", "http://a/.png"])
	})
})

describe("markdown renderer: pathological input", () => {
	const probes = ["*a ", "_a ", "<"].map((unit) => unit.repeat(Math.ceil(65_536 / unit.length)).slice(0, 65_536))
	for (const probe of probes) {
		test(`${JSON.stringify(probe.slice(0, 3))} x 64k renders quickly as plain text`, () => {
			const started = performance.now()
			const render = renderMarkdownUncached(probe, { width: 80 })
			expect(performance.now() - started).toBeLessThan(200)
			expect(markdownPlainText(render.lines[0]!)).toBe(PLAIN_TEXT_NOTE)
		})
	}

	test("dense emphasis under the size budget also falls back", () => {
		const started = performance.now()
		const render = renderMarkdownUncached("*a ".repeat(5_000), { width: 80 })
		expect(performance.now() - started).toBeLessThan(200)
		expect(markdownPlainText(render.lines[0]!)).toBe(PLAIN_TEXT_NOTE)
	})

	test("an ordinary long bullet list still renders as markdown", () => {
		const body = Array.from({ length: 400 }, (_, index) => `- item ${index} with *some* emphasis`).join("\n")
		const render = renderMarkdownUncached(body, { width: 80 })
		expect(markdownPlainText(render.lines[0]!)).toBe("• item 0 with some emphasis")
	})

	test("deep list and quote nesting stops indenting past the cap", () => {
		const list = Array.from({ length: 40 }, (_, depth) => `${"  ".repeat(depth)}- level ${depth}`).join("\n")
		const listLines = renderMarkdownUncached(list, { width: 60 }).lines.map(markdownPlainText)
		const deepest = listLines.find((line) => line.includes("level 39"))!
		expect(deepest.indexOf("level")).toBeLessThanOrEqual(MAX_NEST_DEPTH * 2 + 2)

		const hostile = renderMarkdownUncached(`${">".repeat(15_000)} x`, { width: 60 })
		expect(markdownPlainText(hostile.lines[0]!)).toBe(PLAIN_TEXT_NOTE)

		const quote = `${">".repeat(30)} deep`
		const quoteLine = renderMarkdownUncached(quote, { width: 60 })
			.lines.map(markdownPlainText)
			.find((line) => line.includes("deep"))!
		expect(quoteLine.indexOf("deep")).toBeLessThanOrEqual(MAX_NEST_DEPTH * 2)
	})
})
