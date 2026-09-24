import { TextAttributes } from "@opentui/core"
import { useState } from "react"
import { colors, mixHex, rowHoverBackground } from "./colors.js"
import { fitCell, TextLine } from "./primitives.js"
import { workspaceSurfaceLabels, workspaceSurfaces, type WorkspaceSurface } from "../workspaceSurfaces.js"

export type WorkspaceSurfaceCounts = Partial<Record<WorkspaceSurface, number | string>>

const tabText = (surface: WorkspaceSurface, counts: WorkspaceSurfaceCounts) => {
	const label = workspaceSurfaceLabels[surface]
	const count = counts[surface]
	return count === undefined ? ` ${label} ` : ` ${label} ${count} `
}

export const workspaceTabSeparatorColumns = (counts: WorkspaceSurfaceCounts, surfaces: readonly WorkspaceSurface[] = workspaceSurfaces) => {
	const columns: number[] = []
	let column = 0
	for (const surface of surfaces) {
		column += tabText(surface, counts).length
		columns.push(column)
		column += 1
	}
	return columns
}

export const WorkspaceTabs = ({
	activeSurface,
	width,
	surfaces = workspaceSurfaces,
	counts = {},
	onSelect,
}: {
	activeSurface: WorkspaceSurface
	width: number
	surfaces?: readonly WorkspaceSurface[]
	counts?: WorkspaceSurfaceCounts
	onSelect: (surface: WorkspaceSurface) => void
}) => {
	const [hoveredSurface, setHoveredSurface] = useState<WorkspaceSurface | null>(null)
	const activeCountColor = mixHex(colors.separator, colors.accent, 0.45)
	const rendered = surfaces.map((surface) => {
		const active = surface === activeSurface
		const label = workspaceSurfaceLabels[surface]
		const count = counts[surface]
		const text = tabText(surface, counts)
		return { surface, active, label, count, text }
	})
	const textWidth = rendered.reduce((sum, tab) => sum + tab.text.length, 0) + rendered.length
	const filler = Math.max(0, width - textWidth)

	return (
		<box width={width} height={1} flexDirection="row">
			{rendered.flatMap((tab, index) => [
				...(index > 0
					? [
							<box key={`separator-${tab.surface}`} width={1} height={1}>
								<text wrapMode="none" truncate fg={colors.separator}>
									│
								</text>
							</box>,
						]
					: []),
				<box
					key={tab.surface}
					width={tab.text.length}
					height={1}
					onMouseDown={() => onSelect(tab.surface)}
					onMouseOver={() => setHoveredSurface(tab.surface)}
					onMouseOut={() => setHoveredSurface((current) => (current === tab.surface ? null : current))}
				>
					<text wrapMode="none" truncate>
						<span> </span>
						<span
							fg={tab.active ? colors.accent : colors.muted}
							attributes={tab.active ? TextAttributes.BOLD : 0}
							{...(hoveredSurface === tab.surface ? { bg: rowHoverBackground() } : {})}
						>
							{tab.label}
						</span>
						{tab.count === undefined ? null : (
							<>
								<span {...(hoveredSurface === tab.surface ? { bg: rowHoverBackground() } : {})}> </span>
								<span fg={tab.active ? activeCountColor : colors.separator} {...(hoveredSurface === tab.surface ? { bg: rowHoverBackground() } : {})}>
									{tab.count}
								</span>
							</>
						)}
						<span> </span>
					</text>
				</box>,
			])}
			<box width={1} height={1}>
				<text wrapMode="none" truncate fg={colors.separator}>
					│
				</text>
			</box>
			{filler > 0 ? <TextLine width={filler}>{fitCell("", filler)}</TextLine> : null}
		</box>
	)
}

export const IssuesPlaceholder = ({ width, height, repository }: { width: number; height: number; repository: string | null }) => {
	const rowWidth = Math.max(1, width - 2)
	const context = repository ? repository : "No repository selected"
	const fillerRows = Math.max(0, height - 8)

	return (
		<box width={width} height={height} flexDirection="column" paddingLeft={1} paddingRight={1}>
			<TextLine width={rowWidth}>
				<span fg={colors.accent} attributes={TextAttributes.BOLD}>
					ISSUES
				</span>
			</TextLine>
			<TextLine width={rowWidth}>
				<span fg={colors.muted}>Project </span>
				<span fg={colors.text}>{context}</span>
			</TextLine>
			<box height={1} />
			<TextLine width={rowWidth}>
				<span fg={colors.text}>Issue list/detail will live here.</span>
			</TextLine>
			<TextLine width={rowWidth}>
				<span fg={colors.muted}>This keeps the new workspace shell visible while PRs stay fully usable.</span>
			</TextLine>
			<box height={1} />
			<TextLine width={rowWidth}>
				<span fg={colors.count}>1</span>
				<span fg={colors.muted}> pull requests </span>
				<span fg={colors.count}>2</span>
				<span fg={colors.muted}> issues </span>
				<span fg={colors.count}>tab</span>
				<span fg={colors.muted}> switch surface</span>
			</TextLine>
			{Array.from({ length: fillerRows }, (_, index) => (
				<box key={index} height={1} />
			))}
		</box>
	)
}
