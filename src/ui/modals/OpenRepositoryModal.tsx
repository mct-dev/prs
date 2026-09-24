import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { OpenRepositoryModalState } from "./types.js"

export const OpenRepositoryModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: OpenRepositoryModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const inputText = state.query.length > 0 ? state.query : "owner/name or GitHub URL"

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Open Repository"
			headerRight={{ text: "owner/name" }}
			subtitle={
				<TextLine>
					<span fg={colors.count}>› </span>
					<span fg={state.query.length > 0 ? colors.text : colors.muted}>{fitCell(inputText, Math.max(1, contentWidth - 2))}</span>
				</TextLine>
			}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: "open" },
						{ key: "ctrl-u", label: "clear" },
						{ key: "ctrl-w", label: "word" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<PlainLine text={fitCell("Switches to the selected repository view.", contentWidth)} fg={colors.muted} />
			)}
		</StandardModal>
	)
}
