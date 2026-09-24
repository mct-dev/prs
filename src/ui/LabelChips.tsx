import { Fragment } from "react"
import type { PullRequestLabel } from "../domain.js"
import { colors } from "./colors.js"
import { labelColor, labelTextColor } from "./pullRequests.js"

export const labelChipsWidth = (labels: readonly PullRequestLabel[]) => labels.reduce((total, label, index) => total + label.name.length + 2 + (index > 0 ? 1 : 0), 0)

export const labelChipRows = (labels: readonly PullRequestLabel[], width: number): readonly (readonly PullRequestLabel[])[] => {
	const rows: PullRequestLabel[][] = []
	let current: PullRequestLabel[] = []
	let currentWidth = 0
	for (const label of labels) {
		const labelWidth = label.name.length + 2
		const nextWidth = currentWidth + labelWidth + (current.length > 0 ? 1 : 0)
		if (current.length > 0 && nextWidth > width) {
			rows.push(current)
			current = [label]
			currentWidth = labelWidth
		} else {
			current.push(label)
			currentWidth = nextWidth
		}
	}
	if (current.length > 0) rows.push(current)
	return rows
}

export const LabelChips = ({ labels }: { labels: readonly PullRequestLabel[] }) => (
	<>
		{labels.map((label, index) => {
			const bg = labelColor(label)
			return (
				<Fragment key={label.name}>
					{index > 0 ? <span fg={colors.muted}> </span> : null}
					<span bg={bg} fg={labelTextColor(bg)}>
						{" "}
						{label.name}{" "}
					</span>
				</Fragment>
			)
		})}
	</>
)
