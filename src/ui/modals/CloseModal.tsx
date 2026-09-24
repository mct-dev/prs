import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import { shortRepoName } from "../pullRequests.js"
import type { CloseModalState } from "./types.js"

export const CloseModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: CloseModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const isIssue = state.kind === "issue"
	const kindLabel = isIssue ? "issue" : "pull request"
	const title = state.number ? `Close  #${state.number}` : `Close ${kindLabel}`
	const subtitleText = isIssue ? "This will close the issue without resolving it." : "This will close the pull request without merging it."
	const confirmLabel = isIssue ? "close issue" : "close"
	const rightText = state.running ? `${loadingIndicator} closing` : "confirm"
	const repo = state.repository ? shortRepoName(state.repository) : ""
	const titleLines = [fitCell(repo, contentWidth), fitCell(state.title, contentWidth)]
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
			subtitle={<PlainLine text={fitCell(subtitleText, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: confirmLabel },
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
					<PlainLine text={titleLines[1]!} fg={colors.text} bold />
					<Filler rows={bottomRows} prefix="bottom" />
				</>
			)}
		</StandardModal>
	)
}
