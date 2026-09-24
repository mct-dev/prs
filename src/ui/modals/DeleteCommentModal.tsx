import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { DeleteCommentModalState } from "./types.js"

export const DeleteCommentModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: DeleteCommentModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title = "Delete comment"
	const rightText = state.running ? `${loadingIndicator} deleting` : "confirm"
	const previewLine = state.preview.length > 0 ? state.preview : "(empty body)"
	const titleLines = [fitCell(`@${state.author}`, contentWidth), fitCell(previewLine, contentWidth)]
	const topRows = Math.max(0, Math.floor((bodyHeight - titleLines.length - 2) / 2))
	const bottomRows = Math.max(0, bodyHeight - topRows - titleLines.length - 2)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			titleFg={colors.error}
			headerRight={{ text: rightText, pending: state.running }}
			subtitle={<PlainLine text={fitCell("This permanently removes the comment on GitHub.", contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: "delete" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<>
					<Filler rows={topRows} prefix="top" />
					<PlainLine text={titleLines[0]!} fg={colors.muted} />
					<PlainLine text={titleLines[1]!} fg={colors.text} />
					<Filler rows={bottomRows} prefix="bottom" />
				</>
			)}
		</StandardModal>
	)
}
