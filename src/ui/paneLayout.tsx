import type React from "react"
import { Divider, fitCell, SeparatorColumn, TextLine } from "./primitives.js"

export const normalizeJunctionRows = (height: number, rows: readonly number[] = []): readonly number[] => {
	const seen = new Set<number>()
	for (const row of rows) {
		if (!Number.isInteger(row) || row < 0 || row >= height) continue
		seen.add(row)
	}
	return [...seen].sort((left, right) => left - right)
}

export const paneContentWidth = (width: number, inset = 1) => Math.max(1, width - inset * 2)

export const SplitPane = ({
	height,
	leftWidth,
	rightWidth,
	left,
	right,
	junctionRows,
	junctions,
}: {
	height: number
	leftWidth: number
	rightWidth: number
	left: React.ReactNode
	right: React.ReactNode
	junctionRows?: readonly number[]
	junctions?: readonly { readonly row: number; readonly char: string }[]
}) => (
	<box flexGrow={1} flexDirection="row">
		<box width={leftWidth} height={height} flexDirection="column">
			{left}
		</box>
		<SeparatorColumn height={height} junctionRows={normalizeJunctionRows(height, junctionRows)} {...(junctions === undefined ? {} : { junctions })} />
		<box width={rightWidth} height={height} flexDirection="column">
			{right}
		</box>
	</box>
)

export const PaneInsetLine = ({ width, inset = 1, children }: { width: number; inset?: number; children: React.ReactNode }) => (
	<TextLine width={width}>
		{inset > 0 ? <span>{fitCell("", inset)}</span> : null}
		{children}
		{inset > 0 ? <span>{fitCell("", inset)}</span> : null}
	</TextLine>
)

export const PaneDivider = ({ width }: { width: number }) => <Divider width={width} />
