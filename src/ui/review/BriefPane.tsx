import { TextAttributes } from "@opentui/core"
import type { PullRequestItem } from "../../domain.js"
import type { BriefStatus } from "../../review/briefStatus.js"
import { colors } from "../colors.js"
import { Divider, Filler, fitCell, PaddedRow, TextLine } from "../primitives.js"
import { shortRepoName } from "../pullRequests.js"
import type { BriefViewRow } from "./briefViewRows.js"

export interface BriefPaneProps {
	readonly pullRequest: PullRequestItem
	readonly status: BriefStatus
	readonly rows: readonly BriefViewRow[]
	readonly focusIndex: number
	readonly scrollTop: number
	readonly contentWidth: number
	readonly height: number
	readonly loadingIndicator: string
	readonly onClickFocus?: (index: number) => void
}

const statusLabel = (status: BriefStatus, loadingIndicator: string): { readonly text: string; readonly fg: string } => {
	switch (status._tag) {
		case "idle":
			return { text: "no review", fg: colors.muted }
		case "running":
			return { text: `${loadingIndicator} running`, fg: colors.status.pending }
		case "error":
			return { text: "failed", fg: colors.status.failing }
		case "done":
			return { text: status.stale ? "stale" : "read-only brief", fg: status.stale ? colors.status.pending : colors.muted }
	}
}

/**
 * Full-screen agent review brief. The body is a fixed slice of pre-wrapped
 * rows (one terminal row each), so the hook's scroll math is exact and the
 * pane never needs a scrollbox. Chrome: header + subline + divider = 3 rows.
 */
export const BriefPane = ({ pullRequest, status, rows, focusIndex, scrollTop, contentWidth, height, loadingIndicator, onClickFocus }: BriefPaneProps) => {
	const bodyHeight = Math.max(1, height - 3)
	const paneWidth = contentWidth + 2
	const title = `${shortRepoName(pullRequest.repository)} #${pullRequest.number} · agent review`
	const right = statusLabel(status, loadingIndicator)
	const gap = Math.max(1, contentWidth - title.length - right.text.length)
	const visible = rows.slice(scrollTop, scrollTop + bodyHeight)
	const more = rows.length - (scrollTop + visible.length)

	return (
		<box flexDirection="column" height={height} backgroundColor={colors.background}>
			<PaddedRow>
				<TextLine>
					<span fg={colors.accent} attributes={TextAttributes.BOLD}>
						{title}
					</span>
					<span>{" ".repeat(gap)}</span>
					<span fg={right.fg}>{right.text}</span>
				</TextLine>
			</PaddedRow>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>{fitCell(`${pullRequest.title}${more > 0 ? `  ↓ ${more} more` : ""}`, contentWidth)}</span>
				</TextLine>
			</PaddedRow>
			<Divider width={paneWidth} />
			<box height={bodyHeight} flexDirection="column">
				{visible.map((viewRow, offset) => {
					const index = scrollTop + offset
					const selected = viewRow.focusIndex !== undefined && viewRow.focusIndex === focusIndex
					const focus = viewRow.focusIndex
					const bg = selected ? colors.selectedBg : undefined
					return (
						<box
							key={`brief-row-${index}`}
							width={paneWidth}
							height={1}
							{...(bg ? { backgroundColor: bg } : {})}
							{...(focus !== undefined && onClickFocus ? { onMouseDown: () => onClickFocus(focus) } : {})}
						>
							<TextLine width={paneWidth} bg={bg}>
								<span> </span>
								{viewRow.segments.map((segment, segmentIndex) =>
									segment.bold ? (
										<span key={segmentIndex} fg={segment.fg} attributes={TextAttributes.BOLD}>
											{segment.text}
										</span>
									) : (
										<span key={segmentIndex} fg={segment.fg}>
											{segment.text}
										</span>
									),
								)}
							</TextLine>
						</box>
					)
				})}
				<Filler rows={Math.max(0, bodyHeight - visible.length)} prefix="brief-fill" />
			</box>
		</box>
	)
}
