import type { DiffCommentSide } from "../../domain.js"

// Split one file's patch into several smaller patches so rows (comment
// threads) can sit between them. Each piece gets its own exact `@@` header
// so the diff renderer numbers its lines as if the file were never cut:
// `@@` rows don't render, so the pieces stack back into the same rows.

export interface PatchCut {
	readonly side: DiffCommentSide
	readonly line: number
}

export interface PatchSegmentation {
	readonly patches: readonly string[]
	// For each cut: the index of the segment it follows, or null when the
	// line isn't in the patch (outdated or file-level).
	readonly placements: readonly (number | null)[]
}

type EntryKind = "add" | "remove" | "context" | "other"

interface Entry {
	readonly text: string
	readonly kind: EntryKind
	readonly hunk: number
	readonly oldBefore: number
	readonly newBefore: number
	// `\ No newline at end of file` and similar markers ride with the line
	// they describe so a cut can never separate them.
	readonly tail: readonly string[]
}

interface ParsedPatch {
	readonly preamble: readonly string[]
	readonly suffixes: readonly string[]
	readonly entries: readonly Entry[]
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

const entryKind = (line: string): EntryKind => {
	const first = line[0]
	if (first === "+") return "add"
	if (first === "-") return "remove"
	if (first === " ") return "context"
	return "other"
}

const parsePatch = (patch: string): ParsedPatch => {
	const preamble: string[] = []
	const suffixes: string[] = []
	const entries: Array<Omit<Entry, "tail"> & { tail: string[] }> = []
	let hunk = -1
	let oldLine = 0
	let newLine = 0
	for (const line of patch.split("\n")) {
		const header = HUNK_HEADER.exec(line)
		if (header) {
			hunk++
			suffixes.push(header[5] ?? "")
			oldLine = Number(header[1])
			newLine = Number(header[3])
			continue
		}
		if (hunk < 0) {
			preamble.push(line)
			continue
		}
		if (line.startsWith("\\") && entries.length > 0) {
			entries[entries.length - 1]!.tail.push(line)
			continue
		}
		const kind = entryKind(line)
		entries.push({ text: line, kind, hunk, oldBefore: oldLine, newBefore: newLine, tail: [] })
		if (kind === "remove" || kind === "context") oldLine++
		if (kind === "add" || kind === "context") newLine++
	}
	return { preamble, suffixes, entries }
}

const isChange = (entry: Entry | undefined) => entry?.kind === "add" || entry?.kind === "remove"

const findEntry = (entries: readonly Entry[], cut: PatchCut) =>
	entries.findIndex((entry) =>
		cut.side === "RIGHT"
			? (entry.kind === "add" || entry.kind === "context") && entry.newBefore === cut.line
			: (entry.kind === "remove" || entry.kind === "context") && entry.oldBefore === cut.line,
	)

// Split view pairs a change block's removals and additions side by side, so
// a cut inside the block would re-pair them. Cut after the whole block.
const cutEntryIndex = (entries: readonly Entry[], index: number, view: "unified" | "split") => {
	if (view !== "split" || !isChange(entries[index])) return index
	let end = index
	while (isChange(entries[end + 1]) && entries[end + 1]!.hunk === entries[index]!.hunk) end++
	return end
}

// jsdiff reads a zero-length range's start as one before the first line.
const hunkRange = (start: number, count: number) => `${count === 0 ? Math.max(0, start - 1) : start},${count}`

const renderSegment = (parsed: ParsedPatch, entries: readonly Entry[]) => {
	const lines = [...parsed.preamble]
	let index = 0
	while (index < entries.length) {
		const hunk = entries[index]!.hunk
		let end = index
		while (end < entries.length && entries[end]!.hunk === hunk) end++
		const group = entries.slice(index, end)
		const oldCount = group.filter((entry) => entry.kind === "remove" || entry.kind === "context").length
		const newCount = group.filter((entry) => entry.kind === "add" || entry.kind === "context").length
		lines.push(`@@ -${hunkRange(group[0]!.oldBefore, oldCount)} +${hunkRange(group[0]!.newBefore, newCount)} @@${parsed.suffixes[hunk] ?? ""}`)
		for (const entry of group) lines.push(entry.text, ...entry.tail)
		index = end
	}
	return lines.join("\n")
}

export const segmentPatch = (patch: string, cuts: readonly PatchCut[], view: "unified" | "split"): PatchSegmentation => {
	if (cuts.length === 0) return { patches: [patch], placements: [] }
	const parsed = parsePatch(patch)
	const { entries } = parsed
	const cutAfter = cuts.map((cut) => {
		const index = findEntry(entries, cut)
		return index < 0 ? null : cutEntryIndex(entries, index, view)
	})
	// Boundaries are "a new segment starts at entry N". A cut after the last
	// entry needs no boundary: its rows simply follow the final segment.
	const boundaries = [...new Set(cutAfter.filter((index): index is number => index !== null).map((index) => index + 1))]
		.filter((start) => start < entries.length)
		.sort((left, right) => left - right)
	const segmentOf = (index: number) => boundaries.filter((start) => start <= index).length
	const placements = cutAfter.map((index) => (index === null ? null : segmentOf(index)))
	if (boundaries.length === 0) return { patches: [patch], placements }
	const starts = [0, ...boundaries]
	const patches = starts.map((start, index) => renderSegment(parsed, entries.slice(start, starts[index + 1] ?? entries.length)))
	return { patches, placements }
}
