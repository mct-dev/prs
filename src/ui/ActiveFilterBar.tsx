import { TextAttributes } from "@opentui/core"
import { colors } from "./colors.js"
import { Divider, TextLine } from "./primitives.js"

export const ACTIVE_FILTER_BAR_HEIGHT = 2

export const ActiveFilterBar = ({ label, width }: { readonly label: string; readonly width: number }) => (
	<box width={width} height={ACTIVE_FILTER_BAR_HEIGHT} flexDirection="column">
		<TextLine width={width}>
			<span fg={colors.separator} attributes={TextAttributes.BOLD}>
				FILTER
			</span>
			<span> </span>
			<span fg={colors.accent} attributes={TextAttributes.BOLD}>
				{label}
			</span>
		</TextLine>
		<Divider width={width} />
	</box>
)
