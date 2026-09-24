import type { ReviewEntry } from "../../review/briefStatus.js"
import type { BriefStatus } from "../../review/briefStatus.js"
import type { RiskLevel } from "../../review/briefSchema.js"
import { colors } from "../colors.js"
import { wrapText } from "../DetailsPane.js"
import { fitCell } from "../primitives.js"
import { formatDuration } from "../runs/runsRows.js"
import { riskColor } from "./briefDisplay.js"
import type { BriefDiffTarget } from "./briefViewAtoms.js"

export interface BriefViewSegment {
	readonly text: string
	readonly fg: string
	readonly bold?: boolean
}

/** One body row of the brief view. Focus-area rows carry their index so they can be selected. */
export interface BriefViewRow {
	readonly segments: readonly BriefViewSegment[]
	readonly focusIndex?: number
}

const LABEL_WIDTH = 10
const INDENT = "    "

const blank: BriefViewRow = { segments: [] }
const text = (value: string, fg: string = colors.text, bold = false): BriefViewSegment => (bold ? { text: value, fg, bold } : { text: value, fg })
const row = (...segments: readonly BriefViewSegment[]): BriefViewRow => ({ segments })
const heading = (title: string, suffix?: string): BriefViewRow => row(text(title, colors.count, true), ...(suffix ? [text(suffix, colors.muted)] : []))

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim()

const wrapped = (value: string, width: number, fg: string = colors.text, indent = ""): BriefViewRow[] =>
	wrapText(oneLine(value), Math.max(1, width - indent.length)).map((line) => row(text(`${indent}${line}`, fg)))

const field = (label: string, value: string, width: number, fg: string = colors.text): BriefViewRow =>
	row(text(label.padEnd(LABEL_WIDTH), colors.muted), text(fitCell(value, Math.max(1, width - LABEL_WIDTH)).trimEnd(), fg))

// Hard stop at the content width: headings and hint rows are not wrapped.
const clampRow = (viewRow: BriefViewRow, width: number): BriefViewRow => {
	let remaining = width
	const segments: BriefViewSegment[] = []
	for (const segment of viewRow.segments) {
		if (remaining <= 0) break
		const clipped = segment.text.length > remaining ? segment.text.slice(0, remaining) : segment.text
		remaining -= clipped.length
		segments.push(clipped === segment.text ? segment : { ...segment, text: clipped })
	}
	return segments.length === viewRow.segments.length && remaining >= 0 && segments.every((segment, index) => segment === viewRow.segments[index])
		? viewRow
		: { ...viewRow, segments }
}

const severityTag = (severity: RiskLevel) => (severity === "medium" ? "med" : severity).padEnd(5)

const logRows = (logPath: string | null, width: number): BriefViewRow[] => (logPath ? [field("Log", logPath, width, colors.muted)] : [])

const runRows = (entry: ReviewEntry, status: BriefStatus, headRefOid: string, width: number, now: Date): BriefViewRow[] => {
	const { record } = entry
	const stale = (status._tag === "done" || status._tag === "error") && status.stale
	return [
		heading("Run"),
		field("Preset", `${record.preset} · ${record.agent}${record.mode ? ` · ${record.mode}` : ""}`, width),
		field("Cost", record.costUsd !== null ? `$${record.costUsd.toFixed(2)}` : "—", width),
		field("Duration", formatDuration(record.startedAt, record.finishedAt, now), width),
		field("Head", record.headSha.slice(0, 7), width),
		...(stale ? [field("Stale", `PR head moved to ${headRefOid.slice(0, 7)}; press b to re-run`, width, colors.status.pending)] : []),
		...logRows(record.logPath, width),
	]
}

/**
 * Every body row of the full brief view, one terminal row each. Pure so the
 * hook (selection + scroll math) and the pane (rendering) agree exactly.
 */
export const briefViewRows = ({
	status,
	entry,
	headRefOid,
	width: rawWidth,
	now,
}: {
	readonly status: BriefStatus
	readonly entry: ReviewEntry | null
	readonly headRefOid: string
	readonly width: number
	readonly now: Date
}): readonly BriefViewRow[] => {
	const width = Math.max(1, rawWidth)
	return buildRows(status, entry, headRefOid, width, now).map((viewRow) => clampRow(viewRow, width))
}

const buildRows = (status: BriefStatus, entry: ReviewEntry | null, headRefOid: string, width: number, now: Date): readonly BriefViewRow[] => {
	switch (status._tag) {
		case "idle":
			return [
				heading("No agent review yet"),
				...(entry?.record.status === "cancelled" ? [row(text("The last review was cancelled.", colors.muted))] : []),
				blank,
				row(text("b".padEnd(LABEL_WIDTH), colors.accent), text("run a read-only review with the default preset")),
				row(text("B".padEnd(LABEL_WIDTH), colors.accent), text("pick a review preset")),
			]
		case "running":
			return [
				row(text("Agent review running", colors.status.pending, true), text(` · ${formatDuration(status.startedAt, null, now)} elapsed`, colors.muted)),
				blank,
				...(entry ? [field("Preset", `${entry.record.preset} · ${entry.record.agent}`, width), ...logRows(entry.record.logPath, width)] : []),
				blank,
				row(text("x".padEnd(LABEL_WIDTH), colors.accent), text("cancel the review")),
				row(text("o".padEnd(LABEL_WIDTH), colors.accent), text("open the log")),
			]
		case "error":
			return [
				row(text("Agent review failed", colors.status.failing, true), ...(status.stale ? [text(" · stale", colors.muted)] : [])),
				...wrapped(status.message, width, colors.status.failing),
				blank,
				...(entry ? runRows(entry, status, headRefOid, width, now) : []),
				blank,
				row(text("b".padEnd(LABEL_WIDTH), colors.accent), text("retry · o open the log")),
			]
		case "done": {
			const brief = status.brief
			const focusAreas = brief.focus_areas
			return [
				row(
					text("Risk ", colors.muted),
					text(brief.risk.toUpperCase(), riskColor(brief.risk), true),
					text(" · confidence ", colors.muted),
					text(brief.confidence, riskColor(brief.confidence)),
					...(status.stale ? [text(" · stale", colors.status.pending)] : []),
				),
				blank,
				heading("Summary"),
				...wrapped(brief.summary, width),
				...(brief.before_after ? [blank, heading("Before / after"), ...wrapped(brief.before_after, width)] : []),
				blank,
				heading("Focus areas", ` (${focusAreas.length})${focusAreas.length > 0 ? " · enter opens the diff" : ""}`),
				...(focusAreas.length === 0 ? [row(text("None flagged.", colors.muted))] : []),
				...focusAreas.flatMap((area, focusIndex): BriefViewRow[] => [
					{
						focusIndex,
						segments: [
							text(severityTag(area.severity), riskColor(area.severity), true),
							text(fitCell(area.lines ? `${area.file}:${area.lines}` : area.file, Math.max(1, width - 5)).trimEnd()),
						],
					},
					...wrapped(area.why, width, colors.muted, INDENT).map((line) => ({ ...line, focusIndex })),
				]),
				...(brief.safe_to_skip.length > 0
					? [blank, heading("Safe to skip", ` (${brief.safe_to_skip.length})`), ...brief.safe_to_skip.flatMap((skip) => wrapped(`${skip.path} — ${skip.why}`, width, colors.text))]
					: []),
				...(brief.questions.length > 0 ? [blank, heading("Questions"), ...brief.questions.flatMap((question) => wrapped(`• ${question}`, width))] : []),
				...(brief.tests ? [blank, heading("Tests"), ...wrapped(brief.tests, width)] : []),
				...(entry ? [blank, ...runRows(entry, status, headRefOid, width, now)] : []),
			]
		}
	}
}

/** First body row of each focus area, in focus order. */
export const focusRowOffsets = (rows: readonly BriefViewRow[]): readonly number[] => {
	const offsets: number[] = []
	rows.forEach((viewRow, index) => {
		if (viewRow.focusIndex !== undefined && offsets[viewRow.focusIndex] === undefined) offsets[viewRow.focusIndex] = index
	})
	return offsets
}

/** Rows belonging to one focus area: [first, last] inclusive, or null. */
export const focusRowSpan = (rows: readonly BriefViewRow[], focusIndex: number): readonly [number, number] | null => {
	let first = -1
	let last = -1
	rows.forEach((viewRow, index) => {
		if (viewRow.focusIndex !== focusIndex) return
		if (first === -1) first = index
		last = index
	})
	return first === -1 ? null : [first, last]
}

/** Scroll offset that keeps rows [first, last] inside a `height`-row viewport. */
export const scrollToKeepVisible = (scrollTop: number, height: number, first: number, last: number): number => {
	if (first < scrollTop) return first
	if (last >= scrollTop + height) return Math.max(0, Math.min(first, last - height + 1))
	return scrollTop
}

// === Focus area → diff location ===

const normalizePath = (path: string) =>
	path
		.trim()
		.replace(/^\.\//, "")
		.replace(/^[ab]\//, "")
		.replace(/^\/+/, "")

interface ResolvableAnchor {
	readonly fileIndex: number
	readonly line: number
	readonly side: "LEFT" | "RIGHT"
}

/**
 * Where a focus area lands in the diff: the matching file (exact path, then a
 * path-suffix match), and the first new-side line at or after the brief's
 * first line number. `anchorIndex` is null when there is no line to land on,
 * which means "top of the file".
 */
export const resolveBriefDiffTarget = (
	target: BriefDiffTarget,
	files: readonly { readonly name: string }[],
	anchors: readonly ResolvableAnchor[],
): { readonly fileIndex: number; readonly anchorIndex: number | null } | null => {
	const wanted = normalizePath(target.file)
	if (wanted.length === 0) return null
	const names = files.map((file) => normalizePath(file.name))
	let fileIndex = names.indexOf(wanted)
	if (fileIndex === -1) fileIndex = names.findIndex((name) => name.endsWith(`/${wanted}`) || wanted.endsWith(`/${name}`))
	if (fileIndex === -1) return null
	const lineMatch = target.lines?.match(/\d+/)
	if (!lineMatch) return { fileIndex, anchorIndex: null }
	const line = Number(lineMatch[0])
	let anchorIndex: number | null = null
	anchors.forEach((anchor, index) => {
		if (anchor.fileIndex !== fileIndex || anchor.side !== "RIGHT" || anchor.line < line) return
		if (anchorIndex === null || anchor.line < anchors[anchorIndex]!.line) anchorIndex = index
	})
	return { fileIndex, anchorIndex }
}
