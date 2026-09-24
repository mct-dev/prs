import { marked, type Token, type Tokens } from "marked"
import { decodeEntities, htmlToMarkdown, replaceEmojiShortcodes, splitBody, attribute, type BodyChunk } from "./html.js"
import type { MarkdownLine, MarkdownLink, MarkdownOptions, MarkdownRender, MarkdownRole, MarkdownSpan } from "./types.js"
import { breakByWidth, mergeSpans, spansWidth, textWidth, wrapSpans } from "./wrap.js"

// Details blocks at or under this many rendered lines start expanded.
export const DETAILS_AUTO_OPEN_MAX_LINES = 6
const MAX_HTML_DEPTH = 3
const BULLETS = ["•", "◦", "▪"] as const

interface RenderContext {
	readonly links: MarkdownLink[]
	readonly detailsOpen: boolean | undefined
	detailsCount: number
	collapsedDetails: number
	htmlDepth: number
}

interface InlineStyle {
	readonly role: MarkdownRole
	readonly bold?: boolean
	readonly italic?: boolean
	readonly strike?: boolean
	readonly url?: string
}

const span = (text: string, style: InlineStyle): MarkdownSpan => ({
	text,
	role: style.role,
	...(style.bold ? { bold: true } : {}),
	...(style.italic ? { italic: true } : {}),
	...(style.strike ? { strike: true } : {}),
	...(style.url !== undefined ? { url: style.url } : {}),
})

const registerLink = (context: RenderContext, url: string, label: string, kind: MarkdownLink["kind"]) => {
	const existing = context.links.find((link) => link.url === url)
	if (existing) return existing.index
	const index = context.links.length + 1
	context.links.push({ index, url, label, kind })
	return index
}

// Long bare URLs are the main source of unreadable walls in bot comments;
// show host + a clipped path and keep the full URL in the link list.
export const shortenUrl = (url: string, max = 48) => {
	const display = url.replace(/^https?:\/\//, "").replace(/\/$/, "")
	return textWidth(display) <= max ? display : `${breakByWidth(display, max - 1)[0]}…`
}

const plainText = (tokens: readonly Token[] | undefined): string =>
	(tokens ?? [])
		.map((token) => {
			if ("tokens" in token && Array.isArray(token.tokens) && token.tokens.length > 0) return plainText(token.tokens)
			if (token.type === "image") return (token as Tokens.Image).text
			if (token.type === "br") return " "
			return "text" in token && typeof token.text === "string" ? decodeEntities(token.text) : ""
		})
		.join("")

const textContent = (text: string) => replaceEmojiShortcodes(decodeEntities(text))

// Inline HTML (`<b>`, `<br>`, `<a>`, `<img>`, ...) arrives as separate open
// and close tag tokens, so style is tracked on a small mutable stack.
interface HtmlInlineState {
	bold: number
	italic: number
	strike: number
	code: number
	url: string | null
}

const inlineSpans = (
	tokens: readonly Token[] | undefined,
	style: InlineStyle,
	context: RenderContext,
	html: HtmlInlineState = { bold: 0, italic: 0, strike: 0, code: 0, url: null },
): MarkdownSpan[] => {
	const out: MarkdownSpan[] = []
	const current = (): InlineStyle => ({
		role: html.code > 0 ? "code" : html.url !== null ? "link" : style.role,
		bold: style.bold || html.bold > 0,
		italic: style.italic || html.italic > 0,
		strike: style.strike || html.strike > 0,
		...(html.url !== null ? { url: html.url } : style.url !== undefined ? { url: style.url } : {}),
	})
	const pushImage = (alt: string, url: string) => {
		const index = registerLink(context, url, alt.length > 0 ? alt : "image", "image")
		out.push(span(`▣ image${alt.length > 0 ? `: ${alt}` : ""}`, { role: "image", url }), span(`[${index}]`, { role: "linkIndex" }))
	}
	for (const token of tokens ?? []) {
		switch (token.type) {
			case "text":
			case "escape": {
				const text = token as Tokens.Text
				if (text.tokens && text.tokens.length > 0) out.push(...inlineSpans(text.tokens, current(), context, html))
				else out.push(span(token.type === "escape" ? text.text : textContent(text.text), current()))
				break
			}
			case "strong":
				out.push(...inlineSpans((token as Tokens.Strong).tokens, { ...current(), bold: true }, context, html))
				break
			case "em":
				out.push(...inlineSpans((token as Tokens.Em).tokens, { ...current(), italic: true }, context, html))
				break
			case "del":
				out.push(...inlineSpans((token as Tokens.Del).tokens, { ...current(), strike: true }, context, html))
				break
			case "codespan":
				out.push(span(decodeEntities((token as Tokens.Codespan).text), { ...current(), role: "code" }))
				break
			case "br":
				out.push(span("\n", current()))
				break
			case "link": {
				const link = token as Tokens.Link
				const label = plainText(link.tokens)
				const onlyImage = link.tokens.length === 1 && link.tokens[0]!.type === "image"
				if (onlyImage) {
					const image = link.tokens[0] as Tokens.Image
					pushImage(image.text, image.href)
					break
				}
				const isBare = label === link.href || label === link.href.replace(/^mailto:/, "")
				const index = registerLink(context, link.href, isBare ? shortenUrl(link.href) : label, "link")
				if (isBare) out.push(span(shortenUrl(link.href), { ...current(), role: "link", url: link.href }))
				else out.push(...inlineSpans(link.tokens, { ...current(), role: "link", url: link.href }, context, html))
				out.push(span(`[${index}]`, { role: "linkIndex" }))
				break
			}
			case "image": {
				const image = token as Tokens.Image
				pushImage(image.text, image.href)
				break
			}
			case "html": {
				const tag = (token as Tokens.Tag).text
				const lower = tag.toLowerCase()
				const closing = lower.startsWith("</")
				const name = /^<\/?([a-z0-9-]+)/.exec(lower)?.[1] ?? ""
				const delta = closing ? -1 : 1
				if (name === "b" || name === "strong") html.bold = Math.max(0, html.bold + delta)
				else if (name === "i" || name === "em") html.italic = Math.max(0, html.italic + delta)
				else if (name === "s" || name === "del" || name === "strike") html.strike = Math.max(0, html.strike + delta)
				else if (name === "code" || name === "kbd") html.code = Math.max(0, html.code + delta)
				else if (name === "br") out.push(span("\n", current()))
				else if (name === "a") {
					if (closing) {
						if (html.url !== null) out.push(span(`[${registerLink(context, html.url, html.url, "link")}]`, { role: "linkIndex" }))
						html.url = null
					} else html.url = attribute(tag, "href")
				} else if (name === "img") {
					const src = attribute(tag, "src")
					if (src) pushImage(attribute(tag, "alt") ?? "", src)
				}
				break
			}
			default:
				if ("text" in token && typeof token.text === "string") out.push(span(textContent(token.text), current()))
		}
	}
	return out
}

const blank: MarkdownLine = { spans: [] }

const prefixLines = (lines: readonly MarkdownLine[], first: readonly MarkdownSpan[], rest: readonly MarkdownSpan[]): MarkdownLine[] =>
	lines.map((line, index) => ({ spans: mergeSpans([...(index === 0 ? first : rest), ...line.spans]) }))

const recolor = (lines: readonly MarkdownLine[], from: MarkdownRole, to: MarkdownRole): MarkdownLine[] =>
	lines.map((line) => ({ spans: line.spans.map((item) => (item.role === from ? { ...item, role: to } : item)) }))

const DIFF_LANGS = new Set(["diff", "patch", "udiff"])

const codeLineRole = (lang: string, line: string): MarkdownRole => {
	if (!DIFF_LANGS.has(lang)) return "codeText"
	if (line.startsWith("@@")) return "diffHunk"
	if (line.startsWith("+++") || line.startsWith("---")) return "muted"
	if (line.startsWith("+")) return "diffAdd"
	if (line.startsWith("-")) return "diffRemove"
	return "codeText"
}

const renderCode = (token: Tokens.Code, width: number): MarkdownLine[] => {
	const lang = (token.lang ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""
	const frame = (text: string): MarkdownSpan => ({ text, role: "frame" })
	const body = token.text.replace(/\t/g, "  ").replace(/\n+$/, "")
	const inner = Math.max(1, width - 2)
	const lines: MarkdownLine[] = [{ spans: [frame("╭─"), ...(lang.length > 0 ? [frame(" "), { text: lang, role: "muted" as const }] : [])] }]
	for (const line of body.split("\n")) {
		const role = codeLineRole(lang, line)
		for (const piece of breakByWidth(line, inner)) lines.push({ spans: mergeSpans([frame("│ "), { text: piece, role }]) })
	}
	lines.push({ spans: [frame("╰─")] })
	return lines
}

const renderTable = (token: Tokens.Table, width: number, context: RenderContext): MarkdownLine[] => {
	const cell = (item: Tokens.TableCell, header: boolean) =>
		inlineSpans(item.tokens, { role: "text", bold: header }, context).map((part) => ({ ...part, text: part.text.replace(/\n/g, " ") }))
	const header = token.header.map((item) => cell(item, true))
	const rows = token.rows.map((row) => row.map((item) => cell(item, false)))
	const columns = header.length
	const widths = Array.from({ length: columns }, (_, column) => Math.max(spansWidth(header[column] ?? []), ...rows.map((row) => spansWidth(row[column] ?? []))))
	const separator: MarkdownSpan = { text: " │ ", role: "frame" }
	const total = widths.reduce((sum, value) => sum + value, 0) + separator.text.length * Math.max(0, columns - 1)
	if (total <= width) {
		const line = (cells: readonly (readonly MarkdownSpan[])[]): MarkdownLine => ({
			spans: mergeSpans(
				cells.flatMap((parts, column) => {
					const pad = (widths[column] ?? 0) - spansWidth(parts)
					return [...(column > 0 ? [separator] : []), ...parts, ...(pad > 0 && column < columns - 1 ? [{ text: " ".repeat(pad), role: "text" as const }] : [])]
				}),
			),
		})
		const rule: MarkdownLine = { spans: [{ text: widths.map((value) => "─".repeat(value)).join("─┼─"), role: "frame" }] }
		return [line(header), rule, ...rows.map(line)]
	}
	// Too wide: fall back to one "header: value" line per cell.
	return rows.flatMap((row, rowIndex) => [
		...(rowIndex > 0 ? [blank] : []),
		...row.flatMap((parts, column) => wrapSpans([...(header[column] ?? []).map((part) => ({ ...part, role: "muted" as const })), { text: ": ", role: "muted" }, ...parts], width)),
	])
}

const renderList = (token: Tokens.List, width: number, context: RenderContext, depth: number): MarkdownLine[] => {
	const start = typeof token.start === "number" ? token.start : 1
	const markers = token.items.map((item, index) => (token.ordered ? `${start + index}.` : BULLETS[depth % BULLETS.length]!))
	const markerWidth = Math.max(...markers.map(textWidth))
	return token.items.flatMap((item, index) => {
		const marker = markers[index]!.padStart(token.ordered ? markerWidth : 1)
		const task = item.task ? [{ text: item.checked ? "[x] " : "[ ] ", role: item.checked ? ("taskDone" as const) : ("taskOpen" as const) }] : []
		const first: MarkdownSpan[] = [{ text: `${marker} `, role: "bullet" }, ...task]
		const rest: MarkdownSpan[] = [{ text: " ".repeat(textWidth(marker) + 1 + (item.task ? 4 : 0)), role: "text" }]
		const children = item.tokens.filter((child) => child.type !== "checkbox")
		const body = renderBlocks(children, Math.max(1, width - spansWidth(first)), context, depth + 1, item.loose)
		const lines = prefixLines(body.length > 0 ? body : [blank], first, rest)
		return item.loose && index < token.items.length - 1 ? [...lines, blank] : lines
	})
}

const renderDetails = (chunk: Extract<BodyChunk, { kind: "details" }>, width: number, context: RenderContext, depth: number): MarkdownLine[] => {
	context.detailsCount++
	const body = renderChunks(chunk.body, Math.max(1, width - 2), context, depth)
	const open = context.detailsOpen ?? (chunk.open || body.length <= DETAILS_AUTO_OPEN_MAX_LINES)
	const summary = inlineSpans(
		marked.lexer(chunk.summary, { gfm: true }).flatMap((token) => ("tokens" in token && token.tokens ? token.tokens : [token])),
		{ role: "summary", bold: true },
		context,
	)
	const hidden = open ? [] : [{ text: ` (${body.length} ${body.length === 1 ? "line" : "lines"})`, role: "muted" as const }]
	const header = wrapSpans([...summary, ...hidden], width, { first: [{ text: open ? "▾ " : "▸ ", role: "summary" }], rest: [{ text: "  ", role: "text" }] })
	if (!open) {
		context.collapsedDetails++
		return header
	}
	return [...header, ...prefixLines(body, [{ text: "  ", role: "text" }], [{ text: "  ", role: "text" }])]
}

const renderBlock = (token: Token, width: number, context: RenderContext, depth: number): MarkdownLine[] => {
	switch (token.type) {
		case "space":
		case "def":
			return []
		case "paragraph":
		case "text": {
			const text = token as Tokens.Paragraph | Tokens.Text
			return wrapSpans(text.tokens && text.tokens.length > 0 ? inlineSpans(text.tokens, { role: "text" }, context) : [span(textContent(text.text), { role: "text" })], width)
		}
		case "heading":
			return wrapSpans(inlineSpans((token as Tokens.Heading).tokens, { role: "heading", bold: true }, context), width)
		case "hr":
			return [{ spans: [{ text: "─".repeat(Math.max(1, Math.min(width, 40))), role: "frame" }] }]
		case "code":
			return renderCode(token as Tokens.Code, width)
		case "blockquote": {
			const inner = renderBlocks((token as Tokens.Blockquote).tokens, Math.max(1, width - 2), context, depth, true)
			const bar: MarkdownSpan = { text: "│ ", role: "frame" }
			return prefixLines(recolor(inner, "text", "quote"), [bar], [bar])
		}
		case "list":
			return renderList(token as Tokens.List, width, context, depth)
		case "table":
			return renderTable(token as Tokens.Table, width, context)
		case "html": {
			const html = token as Tokens.HTML
			if (context.htmlDepth >= MAX_HTML_DEPTH) return wrapSpans([span(textContent(html.text.replace(/<[^>]*>/g, "")), { role: "text" })], width)
			context.htmlDepth++
			const lines = renderChunks(splitBody(htmlToMarkdown(html.text)), width, context, depth)
			context.htmlDepth--
			return lines
		}
		default:
			return "text" in token && typeof token.text === "string" ? wrapSpans([span(textContent(token.text), { role: "text" })], width) : []
	}
}

// Join blocks with one blank line (none for tight list items).
const renderBlocks = (tokens: readonly Token[], width: number, context: RenderContext, depth: number, spaced: boolean): MarkdownLine[] => {
	const out: MarkdownLine[] = []
	for (const token of tokens) {
		const lines = renderBlock(token, width, context, depth)
		if (lines.length === 0) continue
		if (out.length > 0 && spaced) out.push(blank)
		out.push(...lines)
	}
	return out
}

const renderChunks = (chunks: readonly BodyChunk[], width: number, context: RenderContext, depth: number): MarkdownLine[] => {
	const out: MarkdownLine[] = []
	for (const chunk of chunks) {
		const lines = chunk.kind === "details" ? renderDetails(chunk, width, context, depth) : renderBlocks(marked.lexer(chunk.text, { gfm: true }), width, context, depth, true)
		if (lines.length === 0) continue
		if (out.length > 0) out.push(blank)
		out.push(...lines)
	}
	return out
}

export const renderMarkdownUncached = (body: string, options: MarkdownOptions): MarkdownRender => {
	const width = Math.max(4, Math.floor(options.width))
	const context: RenderContext = { links: [], detailsOpen: options.detailsOpen, detailsCount: 0, collapsedDetails: 0, htmlDepth: 0 }
	const lines = body.trim().length === 0 ? [{ spans: [{ text: "(empty comment)", role: "muted" as const }] }] : renderChunks(splitBody(body), width, context, 0)
	return {
		lines: lines.length > 0 ? lines : [{ spans: [{ text: "(empty comment)", role: "muted" }] }],
		links: context.links,
		detailsCount: context.detailsCount,
		collapsedDetails: context.collapsedDetails,
	}
}

const CACHE_LIMIT = 400
const cache = new Map<string, MarkdownRender>()

// Rendering is pure in (body, width, detailsOpen); memoize so scrolling and
// re-renders never re-lex a comment.
export const renderMarkdown = (body: string, options: MarkdownOptions): MarkdownRender => {
	const key = `${Math.floor(options.width)}\u0001${options.detailsOpen ?? "auto"}\u0001${body}`
	const hit = cache.get(key)
	if (hit) {
		cache.delete(key)
		cache.set(key, hit)
		return hit
	}
	const rendered = renderMarkdownUncached(body, options)
	cache.set(key, rendered)
	if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
	return rendered
}

export const markdownPlainText = (line: MarkdownLine) => line.spans.map((part) => part.text).join("")
