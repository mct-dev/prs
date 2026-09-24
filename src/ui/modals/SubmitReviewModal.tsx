import { TextAttributes } from "@opentui/core"
import { colors } from "../colors.js"
import { clampCursor, commentEditorLines, cursorLineIndexForLines } from "../commentEditor.js"
import { Divider, fitCell, HintRow, ModalFrame, PaddedRow, PlainLine, standardModalDims, TextLine } from "../primitives.js"
import { submitReviewEventColor, submitReviewOptions } from "./shared.js"
import type { SubmitReviewModalState } from "./types.js"

export const SubmitReviewModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: SubmitReviewModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { innerWidth, contentWidth } = standardModalDims(modalWidth, modalHeight)
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, submitReviewOptions.length - 1))
	const headerRows = 1
	const actionHeight = submitReviewOptions.length
	const errorHeight = state.error ? 1 : 0
	const footerRows = 1
	const dividerRows = 3
	const frameBorderRows = 2
	const editorHeight = Math.max(1, modalHeight - frameBorderRows - headerRows - actionHeight - errorHeight - footerRows - dividerRows)
	const actionDividerRow = headerRows
	const editorDividerRow = headerRows + 1 + actionHeight
	const footerDividerRow = editorDividerRow + 1 + errorHeight + editorHeight
	const lineRanges = commentEditorLines(state.body)
	const cursor = clampCursor(state.body, state.cursor)
	const cursorLineIndex = cursorLineIndexForLines(lineRanges, cursor)
	const visibleStart = Math.min(Math.max(0, lineRanges.length - editorHeight), Math.max(0, cursorLineIndex - editorHeight + 1))
	const visibleLines = lineRanges.slice(visibleStart, visibleStart + editorHeight)
	const title = "Submit review"
	const editorFocused = state.focus === "body"
	const renderEditorLine = (line: { readonly text: string; readonly start: number; readonly end: number }, index: number) => {
		const lineIndex = visibleStart + index
		const isCursorLine = lineIndex === cursorLineIndex
		const cursorColumn = Math.max(0, Math.min(cursor - line.start, line.text.length))
		const viewStart = editorFocused && isCursorLine ? Math.max(0, cursorColumn - contentWidth + 1) : 0
		const visibleText = line.text.slice(viewStart, viewStart + contentWidth)

		if (!editorFocused || !isCursorLine) {
			if (state.body.length === 0 && lineIndex === 0) {
				return <PlainLine key={lineIndex} text={fitCell("Optional review summary...", contentWidth)} fg={colors.muted} />
			}
			return <PlainLine key={lineIndex} text={fitCell(visibleText, contentWidth)} fg={state.body.length > 0 ? colors.text : colors.muted} />
		}

		const cursorInView = cursorColumn - viewStart
		const before = visibleText.slice(0, cursorInView)
		const placeholder = state.body.length === 0 ? "Optional review summary..." : ""
		const cursorChar = placeholder ? (placeholder[0] ?? " ") : (visibleText[cursorInView] ?? " ")
		const after = placeholder ? placeholder.slice(1) : visibleText.slice(cursorInView + 1)

		return (
			<TextLine key={lineIndex}>
				{before ? <span fg={colors.text}>{before}</span> : null}
				<span bg={colors.accent} fg={colors.background}>
					{cursorChar}
				</span>
				{after ? <span fg={placeholder ? colors.muted : colors.text}>{after}</span> : null}
			</TextLine>
		)
	}

	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[actionDividerRow, editorDividerRow, footerDividerRow]}>
			<PaddedRow>
				<TextLine>
					<span fg={colors.accent} attributes={TextAttributes.BOLD}>
						{title}
					</span>
				</TextLine>
			</PaddedRow>
			<Divider width={innerWidth} />
			<box height={actionHeight} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{submitReviewOptions.map((option, index) => {
					const isSelected = index === selectedIndex
					const isFocusedSelection = isSelected && state.focus === "action"
					const titleWidth = Math.min(18, Math.max(8, contentWidth - 8))
					const descriptionWidth = Math.max(1, contentWidth - titleWidth - 4)
					return (
						<TextLine key={option.event} bg={isFocusedSelection ? colors.selectedBg : undefined} fg={isFocusedSelection ? colors.selectedText : colors.text}>
							<span fg={submitReviewEventColor(option.event)}>{isFocusedSelection ? "›" : isSelected ? "✓" : " "}</span>
							<span> {fitCell(option.title, titleWidth)}</span>
							<span fg={isFocusedSelection ? colors.selectedText : colors.muted}>{fitCell(option.description, descriptionWidth)}</span>
						</TextLine>
					)
				})}
			</box>
			<Divider width={innerWidth} />
			{state.error ? (
				<PaddedRow>
					<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
				</PaddedRow>
			) : null}
			<box height={editorHeight} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{visibleLines.map(renderEditorLine)}
			</box>
			<Divider width={innerWidth} />
			<PaddedRow>
				<HintRow
					items={
						editorFocused
							? [
									{ key: "shift-enter", label: "newline" },
									{ key: "enter", label: "submit" },
									{ key: "esc", label: "actions" },
								]
							: [
									{ key: "↑↓", label: "action" },
									{ key: "enter", label: "summary" },
									{ key: "esc", label: "cancel" },
								]
					}
				/>
			</PaddedRow>
		</ModalFrame>
	)
}
