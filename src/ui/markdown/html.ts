// Pre-lexing passes over a GitHub comment body: strip HTML comments, pull
// out `<details>` regions (CommonMark would otherwise split them at blank
// lines into unrelated tokens), and convert the GitHub HTML subset into
// markdown so the marked lexer can take it from there. Fenced code is
// protected throughout so `<b>` inside a code block stays literal.

export type BodyChunk =
	| { readonly kind: "markdown"; readonly text: string }
	| { readonly kind: "details"; readonly summary: string; readonly open: boolean; readonly body: readonly BodyChunk[] }

const FENCE_MARK = "\uE000F"
const FENCE_END = "\uE000"
const FENCE_TOKEN = /\uE000F(\d+)\uE000/g
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/

interface ProtectedText {
	readonly text: string
	readonly fences: readonly string[]
}

export const protectFences = (source: string): ProtectedText => {
	const lines = source.split("\n")
	const out: string[] = []
	const fences: string[] = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!
		const open = FENCE_OPEN.exec(line)
		if (!open || (open[2]!.startsWith("`") && open[3]!.includes("`"))) {
			out.push(line)
			continue
		}
		const fenceChar = open[2]![0]!
		const fenceLength = open[2]!.length
		let end = lines.length - 1
		for (let probe = index + 1; probe < lines.length; probe++) {
			const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[probe]!)
			if (close && close[1]![0] === fenceChar && close[1]!.length >= fenceLength) {
				end = probe
				break
			}
		}
		fences.push(lines.slice(index, end + 1).join("\n"))
		out.push(`${FENCE_MARK}${fences.length - 1}${FENCE_END}`)
		index = end
	}
	return { text: out.join("\n"), fences }
}

export const restoreFences = (text: string, fences: readonly string[]) => text.replace(FENCE_TOKEN, (_, index: string) => fences[Number(index)] ?? "")

export const stripHtmlComments = (text: string) => text.replace(/<!--[\s\S]*?(?:-->|$)/g, "")

const DETAILS_TAG = /<(\/?)details\b([^>]*)>/gi
const SUMMARY = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i

const markdownChunk = (text: string, fences: readonly string[]): BodyChunk[] => (text.trim().length > 0 ? [{ kind: "markdown", text: restoreFences(text, fences) }] : [])

const extractDetails = (text: string, fences: readonly string[]): BodyChunk[] => {
	const chunks: BodyChunk[] = []
	let cursor = 0
	for (;;) {
		const pattern = new RegExp(DETAILS_TAG.source, "gi")
		pattern.lastIndex = cursor
		let open = pattern.exec(text)
		while (open && open[1] === "/") open = pattern.exec(text)
		if (!open) break
		chunks.push(...markdownChunk(text.slice(cursor, open.index), fences))
		const innerStart = open.index + open[0].length
		let depth = 1
		let innerEnd = text.length
		let after = text.length
		for (let tag = pattern.exec(text); tag; tag = pattern.exec(text)) {
			depth += tag[1] === "/" ? -1 : 1
			if (depth === 0) {
				innerEnd = tag.index
				after = tag.index + tag[0].length
				break
			}
		}
		const inner = text.slice(innerStart, innerEnd)
		const summaryMatch = SUMMARY.exec(inner)
		const summary = restoreFences(summaryMatch?.[1]?.trim() ?? "Details", fences)
		const rest = summaryMatch ? inner.slice(summaryMatch[0].length) : inner
		chunks.push({ kind: "details", summary: summary.length > 0 ? summary : "Details", open: /\bopen\b/i.test(open[2] ?? ""), body: extractDetails(rest, fences) })
		cursor = after
	}
	chunks.push(...markdownChunk(text.slice(cursor), fences))
	return chunks
}

// `<picture>` (dark/light badge variants) collapses to its `<img>`, and a
// link wrapping only an image is joined onto one line so it stays inline
// instead of splitting into an HTML block with indented (code) lines.
export const collapsePictures = (text: string) =>
	text
		.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi, (_, inner: string) => {
			const img = /<img\b[^>]*>/i.exec(inner)?.[0]
			if (img) return img
			const source = /<source\b[^>]*>/i.exec(inner)?.[0]
			const src = source
				? attribute(source, "srcset")
						?.trim()
						.split(/[\s,]+/)[0]
				: undefined
			return src ? `<img src="${src.replace(/"/g, "&quot;")}">` : ""
		})
		.replace(/(<a\b[^>]*>)\s*(<img\b[^>]*>)\s*(<\/a>)/gi, "$1$2$3")

export const splitBody = (body: string): readonly BodyChunk[] => {
	const normalized = body.replace(/\r\n?/g, "\n")
	const { text, fences } = protectFences(normalized)
	return extractDetails(collapsePictures(stripHtmlComments(text)), fences)
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	hellip: "…",
	mdash: "—",
	ndash: "–",
	rarr: "→",
	larr: "←",
	uarr: "↑",
	darr: "↓",
	middot: "·",
	bull: "•",
	copy: "©",
	reg: "®",
	trade: "™",
	times: "×",
	check: "✓",
}

// C0 (except tab/newline), DEL and C1. Comment bodies are untrusted: a raw
// ESC reaching the terminal could rewrite the screen or forge hyperlinks.
// oxlint-disable-next-line no-control-regex -- intentional: untrusted text is scrubbed of terminal controls
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
const isControlCode = (code: number) => (code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)
export const stripControls = (text: string) => text.replace(CONTROL_CHARS, "")
// oxlint-disable-next-line no-control-regex -- intentional: untrusted text is scrubbed of terminal controls
export const hasControls = (text: string) => /[\u0000-\u001f\u007f-\u009f]/.test(text)

export const decodeEntities = (text: string) =>
	text.includes("&")
		? text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
				if (entity[0] === "#") {
					const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
					if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
					return isControlCode(code) ? "" : String.fromCodePoint(code)
				}
				return NAMED_ENTITIES[entity.toLowerCase()] ?? match
			})
		: text

const EMOJI: Record<string, string> = {
	"+1": "👍",
	"-1": "👎",
	thumbsup: "👍",
	thumbsdown: "👎",
	rocket: "🚀",
	tada: "🎉",
	warning: "⚠️",
	white_check_mark: "✅",
	heavy_check_mark: "✔️",
	x: "❌",
	bulb: "💡",
	memo: "📝",
	eyes: "👀",
	fire: "🔥",
	bug: "🐛",
	sparkles: "✨",
	lock: "🔒",
	star: "⭐",
	heart: "❤️",
	construction: "🚧",
	information_source: "ℹ️",
	question: "❓",
	exclamation: "❗",
	robot: "🤖",
	hammer_and_wrench: "🛠️",
	mag: "🔍",
	zap: "⚡",
	recycle: "♻️",
	package: "📦",
}

export const replaceEmojiShortcodes = (text: string) => (text.includes(":") ? text.replace(/:([a-z0-9_+-]+):/g, (match, name: string) => EMOJI[name] ?? match) : text)

export const attribute = (tag: string, name: string): string | null => {
	const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
	if (!match) return null
	return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "")
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "")

const cellText = (html: string) =>
	stripTags(html.replace(/<br\s*\/?>/gi, " "))
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\|/g, "\\|")

const tableToMarkdown = (table: string) => {
	const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => cellText(cell[1]!)))
	const nonEmpty = rows.filter((row) => row.length > 0)
	if (nonEmpty.length === 0) return "\n"
	const columns = Math.max(...nonEmpty.map((row) => row.length))
	const pad = (row: readonly string[]) => [...row, ...Array.from({ length: columns - row.length }, () => "")]
	const lines = nonEmpty.map((row) => `| ${pad(row).join(" | ")} |`)
	lines.splice(1, 0, `|${Array.from({ length: columns }, () => " --- ").join("|")}|`)
	return `\n\n${lines.join("\n")}\n\n`
}

// Markdown link destinations can't hold spaces or parens; percent-encode
// those rather than using `<...>`, which would look like a tag to later passes.
const linkDestination = (url: string) => url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")

const imageToMarkdown = (tag: string) => {
	const src = attribute(tag, "src") ?? ""
	const alt = (attribute(tag, "alt") ?? "").replace(/[[\]]/g, "")
	return src.length > 0 ? `![${alt}](${linkDestination(src)})` : alt
}

// Convert a block of GitHub-flavored HTML into markdown. Anything outside the
// supported subset is dropped down to its text content.
export const htmlToMarkdown = (html: string): string => {
	let text = stripHtmlComments(html)
	text = text.replace(
		/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
		(_, inner: string) => `\n\n\`\`\`\n${decodeEntities(stripTags(inner.replace(/<br\s*\/?>/gi, "\n"))).replace(/\n+$/, "")}\n\`\`\`\n\n`,
	)
	text = text.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => tableToMarkdown(inner))
	text = text.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => `\n\n${inner.replace(/<li\b[^>]*>/gi, "\n1. ")}\n\n`)
	text = text.replace(/<li\b[^>]*>/gi, "\n- ")
	text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => `\n\n${"#".repeat(Number(level))} ${inner.replace(/\s+/g, " ").trim()}\n\n`)
	text = text.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs: string, inner: string) => {
		const href = attribute(attrs, "href")
		const label = inner
			.replace(/<img\b[^>]*>/gi, imageToMarkdown)
			.replace(/<\/?(?:picture|source)\b[^>]*>/gi, "")
			.replace(/\s+/g, " ")
			.trim()
		if (!href) return label
		return `[${label.length > 0 ? label : href}](${linkDestination(href)})`
	})
	text = text.replace(/<img\b[^>]*>/gi, imageToMarkdown)
	text = text.replace(/<br\s*\/?>/gi, "  \n")
	text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
	text = text.replace(/<\/?(?:p|div|ul|ol|section|center|blockquote)\b[^>]*>/gi, "\n\n")
	text = text.replace(/<\/li>/gi, "\n")
	text = text.replace(/<\/?(?:b|strong)\b[^>]*>/gi, "**")
	text = text.replace(/<\/?(?:i|em)\b[^>]*>/gi, "*")
	text = text.replace(/<\/?(?:s|del|strike)\b[^>]*>/gi, "~~")
	text = text.replace(/<\/?(?:code|kbd|tt)\b[^>]*>/gi, "`")
	text = text.replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, "")
	// `</li>` + `<li>` pairs leave blank lines that would make every list loose.
	return text.replace(/\n(?:[ \t]*\n)+(?=[ \t]*(?:- |1\. ))/g, "\n").replace(/\n{3,}/g, "\n\n")
}
