import type { TextareaOptions, TextareaRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { CommentModalState } from "./types.js"

const commentTextareaKeyBindings: TextareaOptions["keyBindings"] = [
	{ name: "return", action: "submit" },
	{ name: "s", ctrl: true, action: "submit" },
	{ name: "return", shift: true, action: "newline" },
]

const commentModalEditorKey = (state: CommentModalState) => {
	const target = state.target
	if (target.kind === "edit") return `edit:${target.commentId}:${state.body.length}`
	if (target.kind === "reply") return `reply:${target.inReplyTo}:${state.body.length}`
	return `${target.kind}:${state.body.length}`
}

export const CommentModal = ({
	state,
	anchorLabel,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	onChange,
	onSubmit,
}: {
	state: CommentModalState
	anchorLabel: string
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	onChange: (body: string, cursor: number) => void
	onSubmit: () => void
}) => {
	const textareaRef = useRef<TextareaRenderable | null>(null)
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title = state.target.kind === "edit" ? "Edit comment" : "Comment"
	const editorHeight = Math.max(1, bodyHeight - (state.error ? 1 : 0))
	const editorKey = commentModalEditorKey(state)
	const syncTextarea = () => {
		const textarea = textareaRef.current
		if (!textarea) return
		onChange(textarea.plainText, textarea.cursorOffset)
	}

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.cursorOffset = state.cursor
	}, [editorKey, state.cursor])

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			headerRight={{ text: "enter save" }}
			subtitle={<PlainLine text={fitCell(anchorLabel, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: "save" },
						{ key: "shift-enter", label: "newline" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? <PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} /> : null}
			<textarea
				key={editorKey}
				ref={textareaRef}
				width={contentWidth}
				height={editorHeight}
				initialValue={state.body}
				placeholder="Write a comment..."
				focused
				wrapMode="word"
				textColor={colors.text}
				focusedTextColor={colors.text}
				placeholderColor={colors.muted}
				cursorColor={colors.accent}
				keyBindings={commentTextareaKeyBindings}
				onContentChange={syncTextarea}
				onCursorChange={syncTextarea}
				onSubmit={onSubmit}
			/>
		</StandardModal>
	)
}
