import type { PullRequestLabel } from "../../domain.js"
import { colors } from "../colors.js"
import { centerCell, Filler, fitCell, PlainLine, searchModalDims, SearchModalFrame, TextLine } from "../primitives.js"
import { labelColor } from "../pullRequests.js"
import { filterLabels } from "./shared.js"
import type { LabelModalState } from "./types.js"

export const LabelModal = ({
	state,
	currentLabels,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: LabelModalState
	currentLabels: readonly PullRequestLabel[]
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { bodyHeight: maxVisible, rowWidth } = searchModalDims(modalWidth, modalHeight)
	const currentNames = new Set(currentLabels.map((l) => l.name.toLowerCase()))
	const filtered = filterLabels(state.availableLabels, state.query)
	const labelMessageTopRows = Math.max(0, Math.floor((maxVisible - 1) / 2))
	const labelMessageBottomRows = Math.max(0, maxVisible - labelMessageTopRows - 1)
	const selectedIndex = filtered.length === 0 ? 0 : Math.max(0, Math.min(state.selectedIndex, filtered.length - 1))
	const scrollStart = Math.min(Math.max(0, filtered.length - maxVisible), Math.max(0, selectedIndex - maxVisible + 1))
	const visibleLabels = filtered.slice(scrollStart, scrollStart + maxVisible)
	const title = "Labels"
	const countText = state.loading ? "loading" : `${filtered.length}/${state.availableLabels.length}`

	return (
		<SearchModalFrame
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			query={state.query}
			placeholder="filter labels"
			countText={countText}
			footer={
				<TextLine>
					<span fg={colors.count}>↑↓</span>
					<span fg={colors.muted}> move </span>
					<span fg={colors.count}>esc</span>
					<span fg={colors.muted}> close</span>
				</TextLine>
			}
		>
			{state.loading ? (
				<>
					<Filler rows={labelMessageTopRows} prefix="top" />
					<PlainLine text={centerCell(`${loadingIndicator} Loading labels`, rowWidth)} fg={colors.muted} />
					<Filler rows={labelMessageBottomRows} prefix="bottom" />
				</>
			) : visibleLabels.length === 0 ? (
				<>
					<Filler rows={labelMessageTopRows} prefix="top" />
					<PlainLine text={centerCell(state.query.length > 0 ? "No matching labels" : "No labels found", rowWidth)} fg={colors.muted} />
					<Filler rows={labelMessageBottomRows} prefix="bottom" />
				</>
			) : (
				visibleLabels.map((label, index) => {
					const actualIndex = scrollStart + index
					const isActive = currentNames.has(label.name.toLowerCase())
					const isSelected = actualIndex === selectedIndex
					const marker = isActive ? "✓" : " "
					const nameWidth = Math.max(1, rowWidth - 5)
					return (
						<box key={label.name} height={1}>
							<TextLine bg={isSelected ? colors.selectedBg : undefined} fg={isSelected ? colors.selectedText : colors.text}>
								<span fg={isActive ? colors.status.passing : colors.muted}>{marker}</span>
								<span> </span>
								<span bg={labelColor(label)}> </span>
								<span> {fitCell(label.name, nameWidth)}</span>
							</TextLine>
						</box>
					)
				})
			)}
		</SearchModalFrame>
	)
}
