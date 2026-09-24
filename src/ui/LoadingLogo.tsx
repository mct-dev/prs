import { TextAttributes } from "@opentui/core"
import { colors, mixHex } from "./colors.js"
import type { DetailPlaceholderContent } from "./DetailsPane.js"
import { centerCell, Filler, PlainLine, TextLine } from "./primitives.js"
import { SPINNER_FRAMES } from "./spinner.js"

type LoadingLogoContent = Pick<DetailPlaceholderContent, "hint">

const GHUI_LOGO = ["█▀▀▀ █  █ █  █ ▀█▀", "█ ▀█ █▀▀█ █  █  █ ", "▀▀▀▀ ▀  ▀ ▀▀▀▀ ▀▀▀"] as const

const LEFT_WORD_WIDTH = 9
const LOGO_WIDTH = Math.max(...GHUI_LOGO.map((line) => line.length))
const LOGO_HEIGHT = GHUI_LOGO.length
const LOGO_BLOCK_HEIGHT = LOGO_HEIGHT + 2

const logoColor = (x: number) => (x < LEFT_WORD_WIDTH ? mixHex(colors.accent, colors.text, 0.14) : mixHex(colors.accent, colors.text, 0.52))

const LOGO_COLORS = Array.from({ length: LOGO_WIDTH }, (_, index) => logoColor(index))
const LOGO_ROWS = GHUI_LOGO.map((line) => Array.from(line.padEnd(LOGO_WIDTH, " "), (char, index) => ({ char, color: LOGO_COLORS[index]! })))

const LogoRow = ({ row, left }: { row: (typeof LOGO_ROWS)[number]; left: number }) => (
	<TextLine>
		<span fg={colors.muted}>{" ".repeat(left)}</span>
		{row.map(({ char, color }, index) =>
			char === " " ? (
				<span key={index}> </span>
			) : (
				<span key={index} fg={color} attributes={TextAttributes.BOLD}>
					{char}
				</span>
			),
		)}
	</TextLine>
)

export const LoadingLogo = ({ content, width, frame }: { content: LoadingLogoContent; width: number; frame: number }) => {
	const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!
	const logoLeft = Math.max(0, Math.floor((width - LOGO_WIDTH) / 2))

	return (
		<box flexDirection="column" width={width}>
			{LOGO_ROWS.map((row, index) => (
				<LogoRow key={index} row={row} left={logoLeft} />
			))}
			<box height={1} />
			<PlainLine text={centerCell(`${spinner} ${content.hint}`, width)} fg={colors.muted} />
		</box>
	)
}

export const LoadingLogoPane = ({ content, width, height, frame }: { content: LoadingLogoContent; width: number; height: number; frame: number }) => {
	if (width < LOGO_WIDTH + 2 || height < LOGO_BLOCK_HEIGHT) {
		const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!
		const topRows = Math.max(0, Math.floor((height - 1) / 2))
		const bottomRows = Math.max(0, height - topRows - 1)
		return (
			<box height={height} flexDirection="column">
				<Filler rows={topRows} prefix="loading-logo-compact-top" />
				<PlainLine text={centerCell(`${spinner} ${content.hint}`, width)} fg={colors.muted} />
				<Filler rows={bottomRows} prefix="loading-logo-compact-bottom" />
			</box>
		)
	}

	const topRows = Math.max(0, Math.floor((height - LOGO_BLOCK_HEIGHT) / 2))
	const bottomRows = Math.max(0, height - topRows - LOGO_BLOCK_HEIGHT)

	return (
		<box height={height} flexDirection="column">
			<Filler rows={topRows} prefix="loading-logo-top" />
			<LoadingLogo content={content} width={width} frame={frame} />
			<Filler rows={bottomRows} prefix="loading-logo-bottom" />
		</box>
	)
}
