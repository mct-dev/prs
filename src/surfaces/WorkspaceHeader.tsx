import { TextAttributes } from "@opentui/core"
import { colors, rowHoverBackground } from "../ui/colors.js"
import { fitCell, TextLine } from "../ui/primitives.js"

export interface WorkspaceHeaderProps {
	readonly selectedRepository: string | null
	readonly homeCrumb: string
	readonly breadcrumbSeparatorText: string
	readonly headerLeftWidth: number
	readonly headerRepoWidth: number
	readonly homeCrumbHovered: boolean
	readonly setHomeCrumbHovered: (hovered: boolean) => void
	readonly goUpWorkspaceScope: () => void
}

export const WorkspaceHeader = ({
	selectedRepository,
	homeCrumb,
	breadcrumbSeparatorText,
	headerLeftWidth,
	headerRepoWidth,
	homeCrumbHovered,
	setHomeCrumbHovered,
	goUpWorkspaceScope,
}: WorkspaceHeaderProps) => {
	if (!selectedRepository) {
		return (
			<TextLine width={headerLeftWidth}>
				<span fg={colors.text} attributes={TextAttributes.BOLD}>
					{fitCell(homeCrumb, headerLeftWidth)}
				</span>
			</TextLine>
		)
	}
	const homeCrumbBg = homeCrumbHovered ? rowHoverBackground() : undefined
	return (
		<>
			<box width={homeCrumb.length} height={1} onMouseDown={() => goUpWorkspaceScope()} onMouseOver={() => setHomeCrumbHovered(true)} onMouseOut={() => setHomeCrumbHovered(false)}>
				<text wrapMode="none" truncate fg={colors.muted} {...(homeCrumbBg === undefined ? {} : { bg: homeCrumbBg })} attributes={TextAttributes.BOLD}>
					{homeCrumb}
				</text>
			</box>
			<TextLine width={breadcrumbSeparatorText.length}>
				<span fg={colors.separator} attributes={TextAttributes.BOLD}>
					{breadcrumbSeparatorText}
				</span>
			</TextLine>
			<TextLine width={headerRepoWidth}>
				<span fg={colors.text} attributes={TextAttributes.BOLD}>
					{headerRepoWidth > 0 ? fitCell(selectedRepository, headerRepoWidth) : ""}
				</span>
			</TextLine>
		</>
	)
}
