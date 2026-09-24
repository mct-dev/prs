import type { PullRequestReviewComment } from "../../domain.js"
import { colors } from "../colors.js"
import { commentTimestamp, stripQuoteHeader, type CommentDisplayLine, type CommentSegment } from "../comments.js"
import type { DiffFileSection, DiffThreadPlacement, StackedDiffCommentAnchor, StackedDiffFilePatch } from "../diff.js"
import { markdownLineSegments, markdownPlainText, renderMarkdown, textWidth } from "../markdown/index.js"
import { diffCommentThreadMapKey } from "./comments.js"

// Thread rows render inside a PaddedRow (1 column each side) and may sit
// next to the scrollbar, so they get the pane width minus three.
export const diffThreadWidth = (paneWidth: number) => Math.max(16, paneWidth - 3)

// Columns taken by the rail ("│ ") in front of every body line.
const RAIL = 2

export interface DiffThread {
	// Same key as `diffCommentThreadsAtom` (`diffKey:path:side:line`).
	readonly key: string
	readonly path: string
	readonly side: PullRequestReviewComment["side"]
	readonly line: number
	readonly comments: readonly PullRequestReviewComment[]
	readonly resolved: boolean
	readonly outdated: boolean
	// Rendered in the block above the file's first line, not at a line.
	readonly fileLevel: boolean
}

export const diffThreadFromComments = (key: string, comments: readonly PullRequestReviewComment[]): DiffThread | null => {
	const root = comments[0]
	if (!root) return null
	const outdated = root.outdated === true
	return {
		key,
		path: root.path,
		side: root.side,
		line: root.line,
		comments,
		resolved: comments.some((comment) => comment.resolved === true),
		outdated,
		// An outdated thread's line points into an older revision, so it
		// can't be placed in the current patch.
		fileLevel: outdated || root.subjectType === "file" || root.line <= 0,
	}
}

export const diffThreadsByPath = (diffKey: string | null, threads: Record<string, readonly PullRequestReviewComment[]>): ReadonlyMap<string, readonly DiffThread[]> => {
	const byPath = new Map<string, DiffThread[]>()
	if (!diffKey) return byPath
	const prefix = `${diffKey}:`
	for (const [key, comments] of Object.entries(threads)) {
		if (!key.startsWith(prefix)) continue
		const thread = diffThreadFromComments(key, comments)
		if (!thread) continue
		const list = byPath.get(thread.path)
		if (list) list.push(thread)
		else byPath.set(thread.path, [thread])
	}
	for (const list of byPath.values()) list.sort((left, right) => left.line - right.line || left.side.localeCompare(right.side))
	return byPath
}

export const diffThreadCount = (threads: ReadonlyMap<string, readonly DiffThread[]>, path: string) => threads.get(path)?.length ?? 0

// Open threads start expanded; resolved, outdated and bot threads start as
// a one-line marker.
export const defaultDiffThreadExpanded = (thread: DiffThread) => !thread.resolved && !thread.outdated && thread.comments[0]?.authorIsBot !== true

// Expansion is stored as "toggled away from the default", like comment cards.
export const diffThreadExpanded = (thread: DiffThread, toggled: ReadonlySet<string>) => defaultDiffThreadExpanded(thread) !== toggled.has(thread.key)

const threadDimmed = (thread: DiffThread) => thread.resolved || thread.outdated

const statusSegments = (thread: DiffThread): CommentSegment[] => [
	...(thread.outdated ? [{ text: " · outdated", fg: colors.status.review }] : []),
	...(thread.resolved ? [{ text: " · ✓ resolved", fg: colors.status.passing }] : []),
]

const fit = (segments: readonly CommentSegment[], width: number): CommentSegment[] => {
	const out: CommentSegment[] = []
	let used = 0
	for (const segment of segments) {
		const room = width - used
		if (room <= 0) break
		const size = textWidth(segment.text)
		if (size <= room) {
			out.push(segment)
			used += size
			continue
		}
		let text = ""
		for (const char of segment.text) {
			if (textWidth(text + char) > room - 1) break
			text += char
		}
		out.push({ ...segment, text: `${text}…` })
		break
	}
	return out
}

const snippet = (body: string) =>
	renderMarkdown(stripQuoteHeader(body), { width: 400 })
		.lines.map((line) => markdownPlainText(line).trim())
		.find((line) => line.length > 0) ?? "(empty comment)"

const authorSegments = (comment: PullRequestReviewComment, dim: boolean): CommentSegment[] => [
	{ text: comment.author, fg: dim ? colors.muted : colors.count, bold: true },
	...(comment.authorIsBot ? [{ text: " [bot]", fg: colors.muted }] : []),
]

// One line: ◆ author  snippet…  +2 replies · outdated
const collapsedLine = (thread: DiffThread, width: number): CommentDisplayLine => {
	const root = thread.comments[0]!
	const dim = threadDimmed(thread)
	const replies = thread.comments.length - 1
	const tail: CommentSegment[] = [...(replies > 0 ? [{ text: `  +${replies} ${replies === 1 ? "reply" : "replies"}`, fg: colors.muted }] : []), ...statusSegments(thread)]
	const head: CommentSegment[] = [{ text: "◆ ", fg: dim ? colors.muted : colors.accent, bold: true }, ...authorSegments(root, dim), { text: "  ", fg: colors.muted }]
	const fixed = [...head, ...tail].reduce((total, segment) => total + textWidth(segment.text), 0)
	const room = Math.max(4, width - fixed)
	const body = fit([{ text: snippet(root.body), fg: dim ? colors.muted : colors.text }], room)
	return { key: `${thread.key}:marker`, segments: fit([...head, ...body, ...tail], width) }
}

const rail = (glyph: string, dim: boolean): CommentSegment => ({ text: `${glyph} `, fg: dim ? colors.separator : colors.muted })

const expandedLines = (thread: DiffThread, width: number): CommentDisplayLine[] => {
	const dim = threadDimmed(thread)
	const bodyWidth = Math.max(8, width - RAIL)
	const lines: CommentDisplayLine[] = []
	thread.comments.forEach((comment, index) => {
		const time = commentTimestamp(comment.createdAt)
		const meta: CommentSegment[] = [
			rail(index === 0 ? "╭" : "├", dim),
			index === 0 ? { text: "◆ ", fg: dim ? colors.muted : colors.accent, bold: true } : { text: "↳ ", fg: colors.muted },
			...authorSegments(comment, dim),
			...(time ? [{ text: ` · ${time}`, fg: colors.muted }] : []),
			...(comment.editedAt ? [{ text: " · edited", fg: colors.muted }] : []),
			...(index === 0 ? statusSegments(thread) : []),
		]
		lines.push({ key: `${thread.key}:${comment.id}:meta`, segments: fit(meta, width) })
		const body = index === 0 ? comment.body : stripQuoteHeader(comment.body)
		renderMarkdown(body, { width: bodyWidth }).lines.forEach((line, lineIndex) => {
			lines.push({ key: `${thread.key}:${comment.id}:${lineIndex}`, segments: fit([rail("│", dim), ...markdownLineSegments(line, dim)], width) })
		})
	})
	lines.push({ key: `${thread.key}:end`, segments: [rail("╰", dim), { text: "c collapse", fg: colors.separator }] })
	return lines
}

export const diffThreadLines = (thread: DiffThread, { expanded, width }: { readonly expanded: boolean; readonly width: number }): readonly CommentDisplayLine[] =>
	expanded ? expandedLines(thread, width) : [collapsedLine(thread, width)]

export const diffThreadPlacements = (threads: readonly DiffThread[], toggled: ReadonlySet<string>, width: number): readonly DiffThreadPlacement[] =>
	threads.map((thread) => ({
		key: thread.key,
		side: thread.side,
		line: thread.fileLevel ? 0 : thread.line,
		height: diffThreadLines(thread, { expanded: diffThreadExpanded(thread, toggled), width }).length,
	}))

type ThreadsSection = Extract<DiffFileSection, { kind: "threads" }>

// The threads `c` acts on: the thread anchored at the cursor's line, else
// the nearest thread block in the cursor's file.
export const diffThreadKeysAtCursor = (stackedFiles: readonly StackedDiffFilePatch[], anchor: StackedDiffCommentAnchor | null, diffKey: string | null): readonly string[] => {
	if (!anchor || !diffKey) return []
	const file = stackedFiles.find((candidate) => candidate.index === anchor.fileIndex)
	if (!file) return []
	const blocks = file.sections.filter((section): section is ThreadsSection => section.kind === "threads")
	const exact = diffCommentThreadMapKey(diffKey, anchor)
	if (blocks.some((block) => block.keys.includes(exact))) return [exact]
	const distance = (block: ThreadsSection) => (block.top > anchor.renderLine ? block.top - anchor.renderLine - 1 : anchor.renderLine - (block.top + block.height - 1))
	const nearest = blocks.reduce<ThreadsSection | null>((best, block) => (best === null || distance(block) < distance(best) ? block : best), null)
	return nearest?.keys ?? []
}

// Flip `keys` to one shared state: the opposite of the first one's.
export const toggleDiffThreads = (threads: readonly DiffThread[], keys: readonly string[], toggled: ReadonlySet<string>): ReadonlySet<string> => {
	const targets = threads.filter((thread) => keys.includes(thread.key))
	const first = targets[0]
	if (!first) return toggled
	return setDiffThreadsExpanded(targets, !diffThreadExpanded(first, toggled), toggled)
}

export const setDiffThreadsExpanded = (threads: readonly DiffThread[], expanded: boolean, toggled: ReadonlySet<string>): ReadonlySet<string> => {
	const next = new Set(toggled)
	for (const thread of threads) {
		if (defaultDiffThreadExpanded(thread) === expanded) next.delete(thread.key)
		else next.add(thread.key)
	}
	return next
}

// shift+c: collapse everything if anything is open, else expand everything.
export const toggleAllDiffThreads = (threads: readonly DiffThread[], toggled: ReadonlySet<string>): ReadonlySet<string> =>
	setDiffThreadsExpanded(threads, !threads.some((thread) => diffThreadExpanded(thread, toggled)), toggled)
