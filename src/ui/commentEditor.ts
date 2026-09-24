export interface CommentEditorValue {
	readonly body: string
	readonly cursor: number
}

export interface CommentEditorLine {
	readonly text: string
	readonly start: number
	readonly end: number
}

export const clampCursor = (body: string, cursor: number) => Math.max(0, Math.min(cursor, body.length))

export const commentEditorLines = (body: string): readonly CommentEditorLine[] =>
	body.split("\n").reduce<CommentEditorLine[]>((ranges, text) => {
		const start = ranges.length === 0 ? 0 : ranges[ranges.length - 1]!.end + 1
		ranges.push({ text, start, end: start + text.length })
		return ranges
	}, [])

export const commentEditorSoftLines = (body: string, width: number): readonly CommentEditorLine[] => {
	const lineWidth = Math.max(1, width)
	return commentEditorLines(body).flatMap((line) => {
		if (line.text.length === 0) return [line]
		const lines: CommentEditorLine[] = []
		for (let offset = 0; offset < line.text.length; offset += lineWidth) {
			const text = line.text.slice(offset, offset + lineWidth)
			lines.push({ text, start: line.start + offset, end: line.start + offset + text.length })
		}
		return lines
	})
}

export const cursorLineIndexForLines = (lines: readonly CommentEditorLine[], cursor: number) =>
	Math.max(
		0,
		lines.findIndex((line, index) => cursor <= line.end || index === lines.length - 1),
	)

export const cursorLineIndex = (body: string, cursor: number) => {
	const lines = commentEditorLines(body)
	const safeCursor = clampCursor(body, cursor)
	return cursorLineIndexForLines(lines, safeCursor)
}

export const lineStartAt = (body: string, cursor: number) => body.lastIndexOf("\n", Math.max(0, clampCursor(body, cursor) - 1)) + 1

export const lineEndAt = (body: string, cursor: number) => {
	const end = body.indexOf("\n", clampCursor(body, cursor))
	return end === -1 ? body.length : end
}

const previousWordStart = (body: string, cursor: number) => {
	let index = clampCursor(body, cursor)
	while (index > 0 && /\s/.test(body[index - 1]!)) index--
	while (index > 0 && !/\s/.test(body[index - 1]!)) index--
	return index
}

const nextWordEnd = (body: string, cursor: number) => {
	let index = clampCursor(body, cursor)
	while (index < body.length && /\s/.test(body[index]!)) index++
	while (index < body.length && !/\s/.test(body[index]!)) index++
	return index
}

const replaceRange = (state: CommentEditorValue, start: number, end: number, text = ""): CommentEditorValue => ({
	body: `${state.body.slice(0, start)}${text}${state.body.slice(end)}`,
	cursor: start + text.length,
})

export const insertText = (state: CommentEditorValue, text: string): CommentEditorValue =>
	replaceRange(state, clampCursor(state.body, state.cursor), clampCursor(state.body, state.cursor), text)

export const moveLeft = (state: CommentEditorValue): CommentEditorValue => ({
	...state,
	cursor: Math.max(0, clampCursor(state.body, state.cursor) - 1),
})

export const moveRight = (state: CommentEditorValue): CommentEditorValue => ({
	...state,
	cursor: Math.min(state.body.length, clampCursor(state.body, state.cursor) + 1),
})

export const moveLineStart = (state: CommentEditorValue): CommentEditorValue => ({
	...state,
	cursor: lineStartAt(state.body, state.cursor),
})

export const moveLineEnd = (state: CommentEditorValue): CommentEditorValue => ({
	...state,
	cursor: lineEndAt(state.body, state.cursor),
})

export const moveWordBackward = (state: CommentEditorValue): CommentEditorValue => ({
	...state,
	cursor: previousWordStart(state.body, state.cursor),
})

export const moveWordForward = (state: CommentEditorValue): CommentEditorValue => ({
	...state,
	cursor: nextWordEnd(state.body, state.cursor),
})

export const moveVertically = (state: CommentEditorValue, delta: number): CommentEditorValue => {
	const lines = commentEditorLines(state.body)
	const safeCursor = clampCursor(state.body, state.cursor)
	const currentLineIndex = cursorLineIndexForLines(lines, safeCursor)
	const currentLine = lines[currentLineIndex] ?? { text: state.body, start: 0, end: state.body.length }
	const targetLine = lines[Math.max(0, Math.min(lines.length - 1, currentLineIndex + delta))] ?? currentLine
	const column = safeCursor - currentLine.start
	return { ...state, cursor: Math.min(targetLine.end, targetLine.start + column) }
}

export const backspace = (state: CommentEditorValue): CommentEditorValue => {
	const cursor = clampCursor(state.body, state.cursor)
	return cursor === 0 ? { ...state, cursor } : replaceRange({ ...state, cursor }, cursor - 1, cursor)
}

export const deleteForward = (state: CommentEditorValue): CommentEditorValue => {
	const cursor = clampCursor(state.body, state.cursor)
	return cursor >= state.body.length ? { ...state, cursor } : replaceRange({ ...state, cursor }, cursor, cursor + 1)
}

export const deleteWordBackward = (state: CommentEditorValue): CommentEditorValue => {
	const cursor = clampCursor(state.body, state.cursor)
	return replaceRange({ ...state, cursor }, previousWordStart(state.body, cursor), cursor)
}

export const deleteWordForward = (state: CommentEditorValue): CommentEditorValue => {
	const cursor = clampCursor(state.body, state.cursor)
	return replaceRange({ ...state, cursor }, cursor, nextWordEnd(state.body, cursor))
}

export const deleteToLineStart = (state: CommentEditorValue): CommentEditorValue => {
	const cursor = clampCursor(state.body, state.cursor)
	return replaceRange({ ...state, cursor }, lineStartAt(state.body, cursor), cursor)
}

export const deleteToLineEnd = (state: CommentEditorValue): CommentEditorValue => {
	const cursor = clampCursor(state.body, state.cursor)
	return replaceRange({ ...state, cursor }, cursor, lineEndAt(state.body, cursor))
}
