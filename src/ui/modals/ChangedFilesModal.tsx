import { colors } from "../colors.js"
import { diffFileStats, diffFileStatsText } from "../diff.js"
import { centerCell, Filler, fitCell, HintRow, MatchedCell, PlainLine, searchModalDims, SearchModalFrame, TextLine } from "../primitives.js"
import type { ChangedFileSearchResult } from "./shared.js"
import type { ChangedFilesModalState } from "./types.js"

export const ChangedFilesModal = ({
	state,
	results,
	totalCount,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: ChangedFilesModalState
	results: readonly ChangedFileSearchResult[]
	totalCount: number
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { bodyHeight: maxVisible, rowWidth } = searchModalDims(modalWidth, modalHeight)
	const filtered = results
	const selectedIndex = filtered.length === 0 ? 0 : Math.max(0, Math.min(state.selectedIndex, filtered.length - 1))
	const scrollStart = Math.min(Math.max(0, filtered.length - maxVisible), Math.max(0, selectedIndex - maxVisible + 1))
	const visibleFiles = filtered.slice(scrollStart, scrollStart + maxVisible)
	const title = "Files"
	const countText = `${filtered.length}/${totalCount}`
	const messageTopRows = Math.max(0, Math.floor((maxVisible - 1) / 2))
	const messageBottomRows = Math.max(0, maxVisible - messageTopRows - 1)

	return (
		<SearchModalFrame
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			query={state.query}
			placeholder="Filter"
			countText={countText}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "move" },
						{ key: "enter", label: "jump" },
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{visibleFiles.length === 0 ? (
				<>
					<Filler rows={messageTopRows} prefix="top" />
					<PlainLine text={centerCell(state.query.length > 0 ? "No matching files" : "No changed files", rowWidth)} fg={colors.muted} />
					<Filler rows={messageBottomRows} prefix="bottom" />
				</>
			) : (
				visibleFiles.map((entry, index) => {
					const actualIndex = scrollStart + index
					const isSelected = actualIndex === selectedIndex
					const stats = diffFileStatsText(diffFileStats(entry.file)) || "0"
					const statsWidth = Math.min(10, Math.max(3, stats.length))
					const nameWidth = Math.max(1, rowWidth - statsWidth)
					return (
						<TextLine
							key={`${entry.index}:${entry.file.name}`}
							width={rowWidth}
							bg={isSelected ? colors.selectedBg : undefined}
							fg={isSelected ? colors.selectedText : colors.text}
						>
							<MatchedCell text={entry.file.name} width={nameWidth} query={state.query} matchIndexes={entry.matchIndexes} />
							<span fg={colors.muted}>{fitCell(stats, statsWidth, "right")}</span>
						</TextLine>
					)
				})
			)}
		</SearchModalFrame>
	)
}
