import { colors } from "./colors.js"

export const SubjectMetaLine = ({
	number,
	author,
	dateText,
	commentsText,
	contentWidth,
}: {
	readonly number: number
	readonly author: string
	readonly dateText: string
	readonly commentsText?: string | null
	readonly contentWidth: number
}) => {
	const leftText = `#${number} by ${author} ${dateText}`
	const commentsGap = commentsText ? Math.max(2, contentWidth - leftText.length - commentsText.length) : 0
	return (
		<>
			<span fg={colors.count}>#{number}</span>
			<span fg={colors.muted}> by </span>
			<span fg={colors.count}>{author}</span>
			<span fg={colors.muted}> {dateText}</span>
			{commentsText ? <span fg={colors.muted}>{" ".repeat(commentsGap)}</span> : null}
			{commentsText ? <span fg={colors.muted}>{commentsText}</span> : null}
		</>
	)
}
