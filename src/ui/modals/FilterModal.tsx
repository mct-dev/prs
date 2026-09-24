import { TextAttributes } from "@opentui/core"
import type { ScopeFilter } from "../filter/atoms.js"
import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, StandardModal, standardModalDims, TextLine } from "../primitives.js"
import type { FilterModalState } from "./types.js"

export interface FilterOption {
	readonly label: string
	readonly value: ScopeFilter
	readonly description: string
}

export const filterOptions: readonly FilterOption[] = [
	{ label: "all", value: "all", description: "show all items in this view" },
	{ label: "author:@me", value: "mine", description: "authored by me" },
]

export const FilterModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	readonly state: FilterModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
}) => {
	const title = state.surface === "issues" ? "Filter Issues" : "Filter Pull Requests"
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, filterOptions.length - 1))
	const { rowWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			subtitle={
				<TextLine>
					<span fg={colors.muted}>Choose a preset filter for this view.</span>
				</TextLine>
			}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "move" },
						{ key: "enter", label: "select" },
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{filterOptions.map((option, index) => {
				const selected = index === selectedIndex
				const descriptionWidth = Math.max(1, rowWidth - option.label.length - 4)
				return (
					<TextLine key={option.value} width={rowWidth} bg={selected ? colors.selectedBg : undefined} fg={selected ? colors.selectedText : colors.text}>
						<span fg={selected ? colors.accent : colors.muted}>{selected ? "›" : " "}</span>
						<span> </span>
						<span fg={selected ? colors.accent : colors.count} attributes={selected ? TextAttributes.BOLD : 0}>
							{option.label}
						</span>
						<span> </span>
						<span fg={colors.muted}>{fitCell(option.description, descriptionWidth)}</span>
					</TextLine>
				)
			})}
			<Filler rows={Math.max(0, bodyHeight - filterOptions.length)} prefix="filter-modal" />
		</StandardModal>
	)
}
