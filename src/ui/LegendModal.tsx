import { colors } from "./colors.js"
import { fitCell, HintRow, PlainLine, StandardModal, standardModalDims, TextLine } from "./primitives.js"
import { CHECK_ICON, CHECK_UNHYDRATED_ICON, REVIEW_ICON } from "./pullRequests.js"
import { riskColor } from "./review/briefDisplay.js"
import { SPINNER_FRAMES } from "./spinner.js"

interface LegendEntry {
	readonly glyphs: readonly { readonly text: string; readonly fg: string }[]
	readonly label: string
}

const entry = (text: string, fg: string, label: string): LegendEntry => ({ glyphs: [{ text, fg }], label })

// Same glyphs and colors the list rows use (see pullRequestRowDisplay / briefGlyph).
export const reviewLegend: readonly LegendEntry[] = [
	entry(REVIEW_ICON.draft, colors.status.draft, "draft"),
	entry(REVIEW_ICON.approved, colors.status.approved, "approved"),
	entry(REVIEW_ICON.changes, colors.status.changes, "changes requested"),
	entry(REVIEW_ICON.review, colors.status.review, "review required"),
	entry(REVIEW_ICON.none, colors.status.none, "no review yet"),
	entry("↻", colors.accent, "auto-merge on"),
]

export const checksLegend: readonly LegendEntry[] = [
	entry(CHECK_ICON.passing, colors.status.passing, "checks passing"),
	entry(CHECK_ICON.failing, colors.status.failing, "a check failed"),
	entry(CHECK_ICON.pending, colors.status.pending, "checks running"),
	entry(CHECK_ICON.none, colors.status.none, "no checks"),
	entry(CHECK_UNHYDRATED_ICON, colors.muted, "still loading"),
]

export const briefLegend: readonly LegendEntry[] = [
	entry(SPINNER_FRAMES[0], colors.status.pending, "brief running"),
	{
		glyphs: [
			{ text: "●", fg: riskColor("low") },
			{ text: "●", fg: riskColor("medium") },
			{ text: "●", fg: riskColor("high") },
		],
		label: "low / med / high risk",
	},
	entry("○", colors.muted, "brief is stale"),
	entry("!", colors.status.failing, "brief failed"),
]

const glyphWidth = (item: LegendEntry) => item.glyphs.length

const EntryCell = ({ item, width }: { readonly item: LegendEntry | undefined; readonly width: number }) => {
	if (!item) return <span fg={colors.muted}>{" ".repeat(Math.max(0, width))}</span>
	return (
		<>
			{item.glyphs.map((glyph, index) => (
				<span key={index} fg={glyph.fg}>
					{glyph.text}
				</span>
			))}
			<span fg={colors.text}>{fitCell(` ${item.label}`, Math.max(0, width - glyphWidth(item)))}</span>
		</>
	)
}

const Columns = ({ left, right, width }: { readonly left: readonly LegendEntry[]; readonly right: readonly LegendEntry[]; readonly width: number }) => {
	const column = Math.floor(width / 2)
	const rows = Math.max(left.length, right.length)
	return (
		<>
			{Array.from({ length: rows }, (_, index) => (
				<TextLine key={index}>
					<EntryCell item={left[index]} width={column} />
					<EntryCell item={right[index]} width={width - column} />
				</TextLine>
			))}
		</>
	)
}

const Heading = ({ left, right, width }: { readonly left: string; readonly right?: string; readonly width: number }) => {
	const column = Math.floor(width / 2)
	return (
		<TextLine>
			<span fg={colors.muted}>{fitCell(left, right === undefined ? width : column)}</span>
			{right === undefined ? null : <span fg={colors.muted}>{fitCell(right, width - column)}</span>}
		</TextLine>
	)
}

/** `?` overlay: what the icons at the start of each PR row mean. */
export const LegendModal = ({ modalWidth, modalHeight, offsetLeft, offsetTop }: { modalWidth: number; modalHeight: number; offsetLeft: number; offsetTop: number }) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const briefLeft = briefLegend.filter((_, index) => index % 2 === 0)
	const briefRight = briefLegend.filter((_, index) => index % 2 === 1)
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Legend"
			subtitle={<PlainLine text={fitCell("Row icons: review · checks · brief", contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "esc", label: "close" },
						{ key: "ctrl-p", label: "all commands" },
					]}
				/>
			}
		>
			<Heading left="Review" right="Checks" width={contentWidth} />
			<Columns left={reviewLegend} right={checksLegend} width={contentWidth} />
			<Heading left="" width={contentWidth} />
			<Heading left="Brief" width={contentWidth} />
			<Columns left={briefLeft} right={briefRight} width={contentWidth} />
		</StandardModal>
	)
}
