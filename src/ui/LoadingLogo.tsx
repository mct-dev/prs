import { memo, useEffect, useMemo, useState } from "react"
import { envVar } from "../env.js"
import { colors, mixHex } from "./colors.js"
import type { DetailPlaceholderContent } from "./DetailsPane.js"
import { ART_FRAME_INTERVAL_MS, ART_LEVELS, artSizeFor, DEFAULT_ART_SEED, LOADING_ART_VARIANTS, type LoadingArtVariant, renderArtFrame, STATIC_ART_FRAME } from "./loadingArt.js"
import { centerCell, Filler, PlainLine, TextLine } from "./primitives.js"
import { SPINNER_FRAMES } from "./spinner.js"

type LoadingLogoContent = Pick<DetailPlaceholderContent, "hint">

// The loading picture. `PRS_LOADING_ART` picks another variant (for trying
// them out); `PRS_NO_ANIMATION=1` shows one still frame.
export const DEFAULT_LOADING_ART_VARIANT: LoadingArtVariant = "contours"

const configuredVariant = (): LoadingArtVariant => {
	const value = envVar("LOADING_ART")
	return LOADING_ART_VARIANTS.find((variant) => variant === value) ?? DEFAULT_LOADING_ART_VARIANT
}

export const loadingArtAnimated = () => envVar("NO_ANIMATION") !== "1"

// Frames count from module load, so the art does not restart when the boot
// screen hands over to the app's own loading screen.
const ART_EPOCH = Date.now()
const currentArtFrame = () => Math.floor((Date.now() - ART_EPOCH) / ART_FRAME_INTERVAL_MS)

export interface ArtTimer {
	readonly setInterval: (callback: () => void, ms: number) => unknown
	readonly clearInterval: (handle: unknown) => void
}

const globalTimer: ArtTimer = {
	setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
	clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
}

export interface LoadingArtProps {
	readonly width: number
	readonly height: number
	/** Theme colors. Passed as props so a theme change re-renders a still frame. */
	readonly baseColor: string
	readonly accentColor: string
	readonly variant?: LoadingArtVariant
	readonly animated?: boolean
	readonly seed?: number
	readonly timer?: ArtTimer
}

/** Owns its own frame timer so animation never re-renders the rest of the app. */
export const LoadingArt = memo(function LoadingArt({
	width,
	height,
	baseColor,
	accentColor,
	variant = configuredVariant(),
	animated = loadingArtAnimated(),
	seed = DEFAULT_ART_SEED,
	timer = globalTimer,
}: LoadingArtProps) {
	const [frame, setFrame] = useState(() => (animated ? currentArtFrame() : STATIC_ART_FRAME))

	useEffect(() => {
		if (!animated) {
			setFrame(STATIC_ART_FRAME)
			return
		}
		const handle = timer.setInterval(() => setFrame(currentArtFrame()), ART_FRAME_INTERVAL_MS)
		return () => timer.clearInterval(handle)
	}, [animated, timer])

	const levelColors = useMemo(
		() => Array.from({ length: ART_LEVELS }, (_, level) => mixHex(baseColor, accentColor, 0.25 + (0.75 * level) / (ART_LEVELS - 1))),
		[baseColor, accentColor],
	)
	const rows = useMemo(() => renderArtFrame({ variant, width, height, frame, seed }), [variant, width, height, frame, seed])

	return (
		<box flexDirection="column" width={width} height={height}>
			{rows.map((row, rowIndex) => {
				// Merge runs of same-colored cells into one span.
				const runs: { text: string; level: number | null }[] = []
				for (const cell of row) {
					const level = cell.char === " " ? null : cell.level
					const last = runs[runs.length - 1]
					if (last && last.level === level) last.text += cell.char
					else runs.push({ text: cell.char, level })
				}
				return (
					<TextLine key={rowIndex} width={width}>
						{runs.map((run, index) =>
							run.level === null ? (
								<span key={index}>{run.text}</span>
							) : (
								<span key={index} fg={levelColors[run.level]!}>
									{run.text}
								</span>
							),
						)}
					</TextLine>
				)
			})}
		</box>
	)
})

const hintLine = (content: LoadingLogoContent, width: number, frame: number) => {
	const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!
	return <PlainLine text={centerCell(`${spinner} ${content.hint}`, width)} fg={colors.muted} />
}

export const LoadingLogoPane = ({ content, width, height, frame }: { content: LoadingLogoContent; width: number; height: number; frame: number }) => {
	const art = artSizeFor(width, height)
	if (art === null) {
		const topRows = Math.max(0, Math.floor((height - 1) / 2))
		const bottomRows = Math.max(0, height - topRows - 1)
		return (
			<box height={height} flexDirection="column">
				<Filler rows={topRows} prefix="loading-logo-compact-top" />
				{hintLine(content, width, frame)}
				<Filler rows={bottomRows} prefix="loading-logo-compact-bottom" />
			</box>
		)
	}

	const blockHeight = art.height + 2
	const topRows = Math.max(0, Math.floor((height - blockHeight) / 2))
	const bottomRows = Math.max(0, height - topRows - blockHeight)
	const artLeft = Math.max(0, Math.floor((width - art.width) / 2))

	return (
		<box height={height} flexDirection="column">
			<Filler rows={topRows} prefix="loading-logo-top" />
			<box flexDirection="row" height={art.height}>
				<box width={artLeft} />
				<LoadingArt width={art.width} height={art.height} baseColor={colors.muted} accentColor={colors.accent} />
			</box>
			<box height={1} />
			{hintLine(content, width, frame)}
			<Filler rows={bottomRows} prefix="loading-logo-bottom" />
		</box>
	)
}
