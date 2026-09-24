import type { PullRequestComment } from "../../domain.js"
import { colors } from "../colors.js"
import { commentTimestamp, stripQuoteHeader, type CommentDisplayLine, type CommentSegment } from "../comments.js"
import { markdownLineSegments, renderMarkdown, shortenUrl, textWidth, type MarkdownLine, type MarkdownLink } from "../markdown/index.js"

// Bodies longer than this start folded; bots always do.
export const CARD_COLLAPSE_MIN_LINES = 12
// Lines of body kept visible on a folded card.
export const CARD_PREVIEW_LINES = 3
export const CARD_BOT_PREVIEW_LINES = 2
export const CARD_BODY_INDENT = 2
const MAX_FOOTNOTES = 9

export type CommentLocation =
	| { readonly kind: "line"; readonly path: string; readonly line: number }
	| { readonly kind: "file"; readonly path: string }
	| { readonly kind: "general" }

export const commentLocation = (comment: PullRequestComment): CommentLocation => {
	if (comment._tag !== "review-comment") return { kind: "general" }
	if (comment.subjectType === "file" || comment.line <= 0) return { kind: "file", path: comment.path }
	return { kind: "line", path: comment.path, line: comment.line }
}

export const isFileComment = (comment: PullRequestComment | null): comment is PullRequestComment & { readonly _tag: "review-comment" } => comment?._tag === "review-comment"

// When nested, the parent is right above, so the quote header is noise.
export const commentDisplayBody = (comment: PullRequestComment, indent: number) => (indent > 0 && comment._tag === "comment" ? stripQuoteHeader(comment.body) : comment.body)

export const commentIsDimmed = (comment: PullRequestComment) => comment._tag === "review-comment" && (comment.resolved === true || comment.outdated === true)

// Link numbering doesn't depend on width or on which details are open
// (folded details still register their links), so any width works here.
export const commentLinks = (comment: PullRequestComment): readonly MarkdownLink[] => renderMarkdown(comment.body, { width: 80 }).links

export interface CommentCardState {
	// Card body folded to a short preview.
	readonly collapsed: boolean
	// undefined = auto (short or `open` details expanded).
	readonly detailsOpen: boolean | undefined
}

export const defaultCardCollapsed = (comment: PullRequestComment, width: number) =>
	comment.authorIsBot === true || renderMarkdown(comment.body, { width }).lines.length > CARD_COLLAPSE_MIN_LINES

// Card state is stored as "toggled away from the default" so new comments
// pick up the default without anyone writing to the atom.
export const resolveCardState = (comment: PullRequestComment, width: number, toggled: ReadonlySet<string>, details: ReadonlyMap<string, boolean>): CommentCardState => ({
	collapsed: defaultCardCollapsed(comment, width) !== toggled.has(comment.id),
	detailsOpen: details.get(comment.id),
})

export interface CommentCard {
	readonly meta: readonly CommentSegment[]
	readonly body: readonly CommentDisplayLine[]
	readonly hiddenLines: number
}

const badge = (text: string, fg: string): CommentSegment[] => [
	{ text: " ", fg: colors.muted },
	{ text, fg },
]

const locationSegments = (location: CommentLocation, room: number): CommentSegment[] => {
	if (location.kind === "general") return badge("general", colors.muted)
	const suffix = location.kind === "line" ? `:${location.line}` : ""
	const label = location.kind === "file" ? " (file)" : ""
	const budget = Math.max(8, room - suffix.length - label.length)
	const path = textWidth(location.path) <= budget ? location.path : `…${location.path.slice(-(budget - 1))}`
	return [{ text: " ", fg: colors.muted }, { text: `${path}${suffix}`, fg: colors.inlineCode }, ...(label ? [{ text: label, fg: colors.muted }] : [])]
}

export const commentCardMeta = (comment: PullRequestComment, { indent, width, collapsed }: { readonly indent: number; readonly width: number; readonly collapsed: boolean }) => {
	const segments: CommentSegment[] = [
		indent > 0 ? { text: "↳", fg: colors.muted, bold: true } : { text: collapsed ? "▸" : "●", fg: colors.count, bold: true },
		{ text: " ", fg: colors.muted },
		{ text: comment.author, fg: colors.count, bold: true },
	]
	if (comment.authorIsBot) segments.push(...badge("[bot]", colors.muted))
	const time = commentTimestamp(comment.createdAt)
	if (time) segments.push({ text: " · ", fg: colors.muted }, { text: time, fg: colors.muted })
	if (comment.editedAt) segments.push({ text: " · edited", fg: colors.muted })
	if (comment._tag === "review-comment") {
		if (comment.resolved) segments.push(...badge("✓ resolved", colors.status.passing))
		if (comment.outdated) segments.push(...badge("outdated", colors.status.review))
	}
	// Replies inherit the thread root's location.
	if (indent === 0) {
		const used = segments.reduce((total, segment) => total + textWidth(segment.text), 0)
		segments.push({ text: " ·", fg: colors.muted }, ...locationSegments(commentLocation(comment), width - used - 2))
	}
	return segments
}

// Blank separator lines waste a folded card's few preview rows.
const previewLines = (lines: readonly MarkdownLine[], count: number): readonly MarkdownLine[] => {
	const shown = lines.filter((line) => line.spans.some((span) => span.text.trim().length > 0)).slice(0, count)
	return shown.length > 0 ? shown : lines.slice(0, 1)
}

const indentLine = (segments: readonly CommentSegment[]): readonly CommentSegment[] => [{ text: " ".repeat(CARD_BODY_INDENT), fg: colors.muted }, ...segments]

// Build the lines of one comment card. Pure in its inputs so heights can be
// measured for scroll-follow and tested without rendering.
export const commentCard = (
	comment: PullRequestComment,
	{ indent, width, state }: { readonly indent: number; readonly width: number; readonly state: CommentCardState },
): CommentCard => {
	const bodyWidth = Math.max(8, width - CARD_BODY_INDENT)
	const rendered = renderMarkdown(commentDisplayBody(comment, indent), { width: bodyWidth, detailsOpen: state.detailsOpen })
	const dim = commentIsDimmed(comment)
	const preview = comment.authorIsBot ? CARD_BOT_PREVIEW_LINES : CARD_PREVIEW_LINES
	const shown = state.collapsed ? previewLines(rendered.lines, preview) : rendered.lines
	const hiddenLines = rendered.lines.length - (state.collapsed ? rendered.lines.indexOf(shown.at(-1)!) + 1 : shown.length)
	const body: CommentDisplayLine[] = shown.map((line, index) => ({ key: `${comment.id}:body:${index}`, segments: indentLine(markdownLineSegments(line, dim)) }))
	if (hiddenLines > 0) {
		body.push({
			key: `${comment.id}:hidden`,
			segments: indentLine([
				{ text: `▸ ${hiddenLines} ${hiddenLines === 1 ? "line" : "lines"} hidden`, fg: colors.muted, italic: true },
				{ text: "  space to expand", fg: colors.separator },
			]),
		})
	} else if (rendered.links.length > 0) {
		const links = rendered.links.slice(0, MAX_FOOTNOTES)
		body.push(
			{ key: `${comment.id}:links`, segments: [] },
			...links.map((link) => ({
				key: `${comment.id}:link:${link.index}`,
				segments: indentLine([
					{ text: `[${link.index}] `, fg: colors.muted },
					{ text: shortenUrl(link.url, Math.max(12, bodyWidth - 5)), fg: colors.link, url: link.url },
				]),
			})),
		)
	}
	return { meta: commentCardMeta(comment, { indent, width, collapsed: state.collapsed && hiddenLines > 0 }), body, hiddenLines }
}
