export interface SingleLineInputKey {
	readonly name: string
	readonly sequence: string
	readonly ctrl?: boolean
	readonly meta?: boolean
}

export const deleteLastWord = (value: string) => value.replace(/\s*\S+\s*$/, "")

export const singleLineText = (text: string) => text.replace(/[\r\n]+/g, " ")

export const printableKeyText = (key: Pick<SingleLineInputKey, "ctrl" | "meta" | "sequence">) => {
	if (key.ctrl || key.meta || key.sequence.length === 0) return null
	// oxlint-disable-next-line no-control-regex -- intentional: skip control characters
	return /^[^\u0000-\u001f\u007f]+$/.test(key.sequence) ? key.sequence : null
}

export const editSingleLineInput = (value: string, key: SingleLineInputKey) => {
	if (key.ctrl && key.name === "u") return ""
	if (key.ctrl && key.name === "w") return deleteLastWord(value)
	if (key.name === "backspace") return value.slice(0, -1)
	const text = printableKeyText(key)
	return text ? value + text : null
}

export const isSingleLineInputKey = (key: SingleLineInputKey) => editSingleLineInput("", key) !== null
