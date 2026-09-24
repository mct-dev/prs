import { colors } from "../colors.js"
import type { CommentSegment } from "../comments.js"
import type { MarkdownLine, MarkdownRole, MarkdownSpan } from "./types.js"

export { renderMarkdown, renderMarkdownUncached, markdownPlainText, shortenUrl, isSectionBreak, DETAILS_AUTO_OPEN_MAX_LINES, MARKDOWN_MAX_CHARS } from "./render.js"
export { textWidth, wrapSpans, breakByWidth } from "./wrap.js"
export type { MarkdownLine, MarkdownLink, MarkdownOptions, MarkdownRender, MarkdownRole, MarkdownSpan } from "./types.js"

// Resolved at paint time so cached renders follow theme switches.
export const markdownRoleColor = (role: MarkdownRole): string => {
	switch (role) {
		case "text":
			return colors.text
		case "muted":
		case "linkIndex":
		case "taskOpen":
			return colors.muted
		case "heading":
		case "summary":
			return colors.accent
		case "code":
			return colors.inlineCode
		case "codeText":
			return colors.text
		case "link":
			return colors.link
		case "quote":
			return colors.muted
		case "frame":
			return colors.separator
		case "bullet":
			return colors.count
		case "diffAdd":
		case "taskDone":
			return colors.status.passing
		case "diffRemove":
			return colors.status.failing
		case "diffHunk":
			return colors.status.review
		case "image":
		case "issueRef":
			return colors.count
		case "alertNote":
			return colors.link
		case "alertTip":
			return colors.status.passing
		case "alertImportant":
			return colors.accent
		case "alertWarning":
			return colors.status.review
		case "alertCaution":
			return colors.status.failing
	}
}

export const markdownSpanSegment = (span: MarkdownSpan, dim = false): CommentSegment => ({
	text: span.text,
	fg: dim && span.role !== "frame" ? colors.muted : markdownRoleColor(span.role),
	...(span.bold ? { bold: true } : {}),
	...(span.italic ? { italic: true } : {}),
	...(span.strike ? { strike: true } : {}),
	...(span.url !== undefined ? { url: span.url, underline: span.role === "link" || span.role === "issueRef" } : {}),
})

export const markdownLineSegments = (line: MarkdownLine, dim = false): readonly CommentSegment[] => line.spans.map((span) => markdownSpanSegment(span, dim))
