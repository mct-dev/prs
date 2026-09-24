import { describe, expect, test } from "bun:test"
import { collectUrlPositions, findUrlAt, inlineSegments, issueReferenceUrl, parseIssueReferenceUrl, type InlinePalette } from "../src/ui/inlineSegments.js"

const PALETTE: InlinePalette = {
	text: "fg-text",
	inlineCode: "fg-code",
	link: "fg-link",
	count: "fg-count",
}

const parse = (text: string) => inlineSegments(text, PALETTE.text, false, PALETTE)
const parseWithRepo = (text: string) => inlineSegments(text, PALETTE.text, false, PALETTE, { issueReferenceRepository: "owner/name" })
const parseBold = (text: string) => inlineSegments(text, PALETTE.text, true, PALETTE)

describe("inlineSegments — plain text", () => {
	test("empty input returns no segments", () => {
		expect(parse("")).toEqual([])
	})

	test("plain text with no tokens yields one segment", () => {
		expect(parse("just words")).toEqual([{ text: "just words", fg: "fg-text", bold: false }])
	})

	test("preserves bold on plain text", () => {
		expect(parseBold("hello")).toEqual([{ text: "hello", fg: "fg-text", bold: true }])
	})
})

describe("inlineSegments — code spans", () => {
	test("backticked text becomes inline code, contents unwrapped", () => {
		expect(parse("call `foo()` now")).toEqual([
			{ text: "call ", fg: "fg-text", bold: false },
			{ text: "foo()", fg: "fg-code", bold: false },
			{ text: " now", fg: "fg-text", bold: false },
		])
	})

	test("URL inside backticks stays raw, no link emitted", () => {
		const segments = parse("see `https://example.com` later")
		expect(segments.find((segment) => segment.url !== undefined)).toBeUndefined()
		expect(segments.some((segment) => segment.text === "https://example.com" && segment.fg === "fg-code")).toBe(true)
	})

	test("ref inside backticks stays raw, no count color", () => {
		const segments = parse("`#123 fixed`")
		expect(segments).toEqual([{ text: "#123 fixed", fg: "fg-code", bold: false }])
	})
})

describe("inlineSegments — markdown links", () => {
	test("[label](url) becomes a link segment carrying the url", () => {
		expect(parse("[click](https://example.com)")).toEqual([{ text: "click", fg: "fg-link", bold: false, underline: true, url: "https://example.com" }])
	})

	test("text around a markdown link is preserved", () => {
		expect(parse("see [docs](https://x.com) here")).toEqual([
			{ text: "see ", fg: "fg-text", bold: false },
			{ text: "docs", fg: "fg-link", bold: false, underline: true, url: "https://x.com" },
			{ text: " here", fg: "fg-text", bold: false },
		])
	})

	test("adjacent markdown links don't bleed into each other", () => {
		expect(parse("[a](u1)[b](u2)")).toEqual([
			{ text: "a", fg: "fg-link", bold: false, underline: true, url: "u1" },
			{ text: "b", fg: "fg-link", bold: false, underline: true, url: "u2" },
		])
	})
})

describe("inlineSegments — markdown strong emphasis", () => {
	test("double-star text is unwrapped and bold", () => {
		expect(parse("This is **important text** now")).toEqual([
			{ text: "This is ", fg: "fg-text", bold: false },
			{ text: "important text", fg: "fg-text", bold: true },
			{ text: " now", fg: "fg-text", bold: false },
		])
	})

	test("bold marker preserves existing bold context", () => {
		expect(parseBold("**already bold**")).toEqual([{ text: "already bold", fg: "fg-text", bold: true }])
	})

	test("code spans win over stars inside code", () => {
		expect(parse("`**raw**`")).toEqual([{ text: "**raw**", fg: "fg-code", bold: false }])
	})

	test("code spans inside bold markers are unwrapped too", () => {
		expect(parse("**`Session.Service.get`**")).toEqual([{ text: "Session.Service.get", fg: "fg-code", bold: true }])
	})
})

describe("inlineSegments — bare URLs", () => {
	test("bare https URL becomes a link with itself as the url", () => {
		expect(parse("check https://example.com")).toEqual([
			{ text: "check ", fg: "fg-text", bold: false },
			{ text: "https://example.com", fg: "fg-link", bold: false, underline: true, url: "https://example.com" },
		])
	})

	test("trailing period is split off the URL", () => {
		const segments = parse("see https://example.com.")
		expect(segments).toEqual([
			{ text: "see ", fg: "fg-text", bold: false },
			{ text: "https://example.com", fg: "fg-link", bold: false, underline: true, url: "https://example.com" },
			{ text: ".", fg: "fg-text", bold: false },
		])
	})

	test("URL inside parentheses doesn't capture the closing paren", () => {
		const segments = parse("(see https://example.com)")
		const link = segments.find((segment) => segment.url !== undefined)
		expect(link?.url).toBe("https://example.com")
	})

	test("http URL also recognized", () => {
		const segments = parse("http://x.com")
		expect(segments[0]?.url).toBe("http://x.com")
	})
})

describe("inlineSegments — references", () => {
	test("#NNN gets count color", () => {
		expect(parse("see #123 today")).toEqual([
			{ text: "see ", fg: "fg-text", bold: false },
			{ text: "#123", fg: "fg-count", bold: false },
			{ text: " today", fg: "fg-text", bold: false },
		])
	})

	test("multiple refs all colored", () => {
		const segments = parse("#1 and #2")
		expect(segments.filter((segment) => segment.fg === "fg-count").map((segment) => segment.text)).toEqual(["#1", "#2"])
	})

	test("refs become internal links when a repository is provided", () => {
		expect(parseWithRepo("see #123")).toEqual([
			{ text: "see ", fg: "fg-text", bold: false },
			{ text: "#123", fg: "fg-count", bold: false, underline: true, url: issueReferenceUrl("owner/name", 123) },
		])
	})

	test("internal ref links round-trip repository and number", () => {
		expect(parseIssueReferenceUrl(issueReferenceUrl("owner/name", 123))).toEqual({ repository: "owner/name", number: 123 })
	})

	test("# alone is not a ref", () => {
		expect(parse("just # here")).toEqual([{ text: "just # here", fg: "fg-text", bold: false }])
	})
})

describe("inlineSegments — mixed", () => {
	test("ref + link + code in one line", () => {
		const segments = parse("Fixes #5 — see [PR](https://x) which uses `await`.")
		expect(segments.map((segment) => segment.text)).toEqual(["Fixes ", "#5", " — see ", "PR", " which uses ", "await", "."])
		expect(segments.find((segment) => segment.text === "PR")?.url).toBe("https://x")
	})
})

describe("collectUrlPositions / findUrlAt", () => {
	const lines = [{ segments: parse("read https://a.com later") }, { segments: parse("see [b](https://b.com) too") }, { segments: parse("plain text") }]

	test("collects URL positions per line with correct columns", () => {
		const positions = collectUrlPositions(lines)
		expect(positions).toEqual([
			{ url: "https://a.com", lineIndex: 0, startCol: 5, endCol: 18 },
			{ url: "https://b.com", lineIndex: 1, startCol: 4, endCol: 5 },
		])
	})

	test("findUrlAt locates a hovered URL by (line, column)", () => {
		const positions = collectUrlPositions(lines)
		expect(findUrlAt(positions, 0, 6)).toBe("https://a.com")
		expect(findUrlAt(positions, 0, 17)).toBe("https://a.com")
		expect(findUrlAt(positions, 0, 18)).toBeNull() // exclusive endCol
		expect(findUrlAt(positions, 0, 4)).toBeNull() // before startCol
		expect(findUrlAt(positions, 2, 0)).toBeNull() // line with no URL
	})
})
