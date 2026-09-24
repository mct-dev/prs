import type { MarkdownLine, MarkdownSpan } from "./types.js"

// Display width, not string length: CJK and emoji take two cells.
export const textWidth = (text: string) => Bun.stringWidth(text)

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

export const graphemes = (text: string): readonly string[] => Array.from(graphemeSegmenter.segment(text), (part) => part.segment)

export const spansWidth = (spans: readonly MarkdownSpan[]) => spans.reduce((total, span) => total + textWidth(span.text), 0)

const sameStyle = (left: MarkdownSpan, right: MarkdownSpan) =>
	left.role === right.role && left.bold === right.bold && left.italic === right.italic && left.strike === right.strike && left.url === right.url

const withText = (span: MarkdownSpan, text: string): MarkdownSpan => ({ ...span, text })

// Merge adjacent spans that share a style so lines stay compact.
export const mergeSpans = (spans: readonly MarkdownSpan[]): MarkdownSpan[] => {
	const merged: MarkdownSpan[] = []
	for (const span of spans) {
		if (span.text.length === 0) continue
		const last = merged[merged.length - 1]
		if (last && sameStyle(last, span)) merged[merged.length - 1] = withText(last, last.text + span.text)
		else merged.push(span)
	}
	return merged
}

// Cut a string into pieces that each fit in `width` cells, on grapheme
// boundaries so emoji and combining marks are never split.
export const breakByWidth = (text: string, width: number): string[] => {
	const safeWidth = Math.max(1, width)
	const pieces: string[] = []
	let current = ""
	let currentWidth = 0
	for (const grapheme of graphemes(text)) {
		const graphemeWidth = textWidth(grapheme)
		if (currentWidth + graphemeWidth > safeWidth && current.length > 0) {
			pieces.push(current)
			current = ""
			currentWidth = 0
		}
		current += grapheme
		currentWidth += graphemeWidth
	}
	if (current.length > 0 || pieces.length === 0) pieces.push(current)
	return pieces
}

interface Piece {
	readonly span: MarkdownSpan
	readonly kind: "word" | "space" | "newline"
}

const toPieces = (spans: readonly MarkdownSpan[]): Piece[] => {
	const pieces: Piece[] = []
	for (const span of spans) {
		for (const part of span.text.split(/(\n|[ \t]+)/)) {
			if (part.length === 0) continue
			if (part === "\n") pieces.push({ span: withText(span, ""), kind: "newline" })
			else if (/^[ \t]+$/.test(part)) pieces.push({ span: withText(span, " "), kind: "space" })
			else pieces.push({ span: withText(span, part), kind: "word" })
		}
	}
	return pieces
}

export interface WrapPrefix {
	readonly first: readonly MarkdownSpan[]
	readonly rest: readonly MarkdownSpan[]
}

// Word-wrap styled spans into lines of at most `width` cells, including the
// prefix. `\n` inside span text is a hard break (GitHub renders comment
// newlines as line breaks).
export const wrapSpans = (spans: readonly MarkdownSpan[], width: number, prefix: WrapPrefix = { first: [], rest: [] }): MarkdownLine[] => {
	const lines: MarkdownLine[] = []
	let current: MarkdownSpan[] = []
	let currentWidth = 0
	let pendingSpace: MarkdownSpan | null = null
	const available = () => Math.max(1, width - spansWidth(lines.length === 0 ? prefix.first : prefix.rest))
	const flush = () => {
		lines.push({ spans: mergeSpans([...(lines.length === 0 ? prefix.first : prefix.rest), ...current]) })
		current = []
		currentWidth = 0
		pendingSpace = null
	}
	for (const piece of toPieces(spans)) {
		if (piece.kind === "newline") {
			flush()
			continue
		}
		if (piece.kind === "space") {
			if (current.length > 0) pendingSpace = piece.span
			continue
		}
		const wordWidth = textWidth(piece.span.text)
		const spaceWidth = pendingSpace ? 1 : 0
		if (currentWidth + spaceWidth + wordWidth <= available()) {
			if (pendingSpace) current.push(pendingSpace)
			current.push(piece.span)
			currentWidth += spaceWidth + wordWidth
			pendingSpace = null
			continue
		}
		if (current.length > 0) flush()
		if (wordWidth <= available()) {
			current.push(piece.span)
			currentWidth = wordWidth
			continue
		}
		const chunks = breakByWidth(piece.span.text, available())
		chunks.forEach((chunk, index) => {
			if (index > 0) flush()
			current.push(withText(piece.span, chunk))
			currentWidth = textWidth(chunk)
		})
	}
	if (current.length > 0 || lines.length === 0) flush()
	return lines
}
