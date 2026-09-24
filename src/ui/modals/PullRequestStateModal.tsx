import { TextAttributes } from "@opentui/core"
import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { PullRequestStateModalState } from "./types.js"

export const PullRequestStateModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: PullRequestStateModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title = "Pull Request State"
	const options = [
		{ isDraft: true, label: "Draft" },
		{ isDraft: false, label: "Ready for review" },
	] as const
	const headerRight = state.running ? { text: `${loadingIndicator} updating`, pending: true } : null
	const bottomRows = Math.max(0, bodyHeight - options.length)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			{...(headerRight ? { headerRight } : {})}
			subtitle={<PlainLine text={fitCell("Select the desired state for this PR.", contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "choose" },
						{ key: "enter", label: "apply" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<>
					{options.map((option) => {
						const isSelected = option.isDraft === state.selectedIsDraft
						const isCurrent = option.isDraft === state.isDraft
						const marker = isSelected ? "›" : " "
						const stateMarker = isCurrent ? "●" : "○"
						const labelWidth = Math.max(1, contentWidth - marker.length - stateMarker.length - 3)
						return (
							<TextLine key={option.label} bg={isSelected ? colors.selectedBg : undefined} fg={isSelected ? colors.selectedText : colors.text}>
								<span fg={isSelected ? colors.count : colors.muted}>{marker}</span>
								<span fg={isCurrent ? colors.count : colors.muted}> {stateMarker}</span>
								{isCurrent ? <span attributes={TextAttributes.BOLD}> {fitCell(option.label, labelWidth)}</span> : <span> {fitCell(option.label, labelWidth)}</span>}
							</TextLine>
						)
					})}
					<Filler rows={bottomRows} prefix="bottom" />
				</>
			)}
		</StandardModal>
	)
}
