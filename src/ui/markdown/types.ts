// Semantic roles instead of hex colors: the theme palette is mutable, so a
// cached render stays valid across theme switches and colors are resolved at
// paint time (see `markdownSegments`).
export type MarkdownRole =
	| "text"
	| "muted"
	| "heading"
	| "code"
	| "codeText"
	| "link"
	| "linkIndex"
	| "quote"
	| "frame"
	| "bullet"
	| "diffAdd"
	| "diffRemove"
	| "diffHunk"
	| "image"
	| "summary"
	| "taskDone"
	| "taskOpen"

export interface MarkdownSpan {
	readonly text: string
	readonly role: MarkdownRole
	readonly bold?: boolean
	readonly italic?: boolean
	readonly strike?: boolean
	readonly url?: string
}

export interface MarkdownLine {
	readonly spans: readonly MarkdownSpan[]
}

export interface MarkdownLink {
	// 1-based; shown inline as `[n]` and in the footnote list.
	readonly index: number
	readonly url: string
	readonly label: string
	readonly kind: "link" | "image"
}

export interface MarkdownRender {
	readonly lines: readonly MarkdownLine[]
	readonly links: readonly MarkdownLink[]
	// Number of `<details>` blocks and how many are currently folded.
	readonly detailsCount: number
	readonly collapsedDetails: number
}

export interface MarkdownOptions {
	readonly width: number
	// undefined = auto (short or `open` blocks expanded, long ones folded).
	readonly detailsOpen?: boolean | undefined
}
