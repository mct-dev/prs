import { TextAttributes } from "@opentui/core"
import type { LoadStatus, PullRequestItem } from "../domain.js"
import { daysOpen } from "../date.js"
import { colors } from "./colors.js"
import { SelectableRow, useHoverState } from "./listSelection/SelectableRow.js"
import { fitCell, MatchedCell, PlainLine, SectionTitle, TextLine } from "./primitives.js"
import { pullRequestRowDisplay, repoColor, reviewIcon } from "./pullRequests.js"

export type PullRequestGroups = Array<[string, PullRequestItem[]]>

/** Header meta for the sections view; groups are keyed by section id. */
export interface PullRequestSectionHeader {
	readonly id: string
	readonly title: string
	readonly status: "loading" | "ready" | "error"
	readonly error: string | null
	readonly collapsed: boolean
	readonly count: number
}

export interface PullRequestSections {
	readonly headers: readonly PullRequestSectionHeader[]
	/** `sections.yaml` problem; the defaults render below it. */
	readonly configError: string | null
}

const pullRequestListRowHeight = (row: PullRequestListRow) => (row._tag === "pull-request" && !row.compact ? 2 : 1)

export type PullRequestListRow =
	| { readonly _tag: "title" }
	| { readonly _tag: "message"; readonly text: string; readonly color: string }
	| { readonly _tag: "group"; readonly repository: string; readonly pullRequests: readonly PullRequestItem[] }
	| { readonly _tag: "section"; readonly section: PullRequestSectionHeader }
	| {
			readonly _tag: "pull-request"
			readonly pullRequest: PullRequestItem
			readonly numberWidth: number
			readonly ageWidth: number
			readonly compact: boolean
			readonly showRepository?: boolean
	  }
	| { readonly _tag: "load-more"; readonly text: string }

const GROUP_ICON = "◆"
const SECTION_OPEN_ICON = "▾"
const SECTION_COLLAPSED_ICON = "▸"

const getRowLayout = (contentWidth: number, numberWidth: number, ageWidth: number) => {
	const reviewWidth = 1
	const checkWidth = 2
	const fixedWidth = reviewWidth + 1 + numberWidth + 1 + checkWidth + ageWidth
	const titleWidth = Math.max(8, contentWidth - fixedWidth)
	return { reviewWidth, checkWidth, ageWidth, numberWidth, titleWidth }
}

const groupNumberWidth = (pullRequests: readonly PullRequestItem[]) => {
	if (pullRequests.length === 0) return 4
	const maxLen = Math.max(...pullRequests.map((pr) => String(pr.number).length))
	return maxLen + 1
}

const groupAgeWidth = (pullRequests: readonly PullRequestItem[]) => {
	if (pullRequests.length === 0) return 4
	const maxLen = Math.max(...pullRequests.map((pr) => `${daysOpen(pr.updatedAt)}d`.length))
	return Math.max(4, maxLen + 1)
}

const GroupTitle = ({ label, color, filterText }: { label: string; color: string; filterText: string }) => (
	<TextLine>
		<span fg={color}>{GROUP_ICON} </span>
		<span fg={color} attributes={TextAttributes.BOLD}>
			<MatchedCell text={label} width={label.length} query={filterText} />
		</span>
	</TextLine>
)

const SectionHeaderLine = ({
	section,
	loadingIndicator,
	contentWidth,
	onToggle,
}: {
	section: PullRequestSectionHeader
	loadingIndicator: string
	contentWidth: number
	onToggle: () => void
}) => (
	<TextLine width={contentWidth} onMouseDown={onToggle}>
		<span fg={colors.accent}>{section.collapsed ? SECTION_COLLAPSED_ICON : SECTION_OPEN_ICON} </span>
		<span fg={colors.accent} attributes={TextAttributes.BOLD}>
			{section.title}
		</span>
		<span fg={colors.count}> {section.count}</span>
		{section.status === "loading" ? <span fg={colors.muted}> {loadingIndicator}</span> : null}
		{section.status === "error" ? <span fg={colors.error}> !</span> : null}
	</TextLine>
)

const buildSectionRows = (
	rows: PullRequestListRow[],
	sections: PullRequestSections,
	groups: PullRequestGroups,
	status: LoadStatus,
	error: string | null,
	filterText: string,
	compact: boolean,
) => {
	if (sections.configError) rows.push({ _tag: "message", text: `! ${sections.configError} (using defaults)`, color: colors.error })
	const itemCount = groups.reduce((count, [, pullRequests]) => count + pullRequests.length, 0)
	if (status === "loading" && sections.headers.length === 0) rows.push({ _tag: "message", text: "- Loading sections...", color: colors.muted })
	if (status === "error" && sections.headers.length === 0) rows.push({ _tag: "message", text: `- ${error ?? "Could not load sections."}`, color: colors.error })
	if (filterText.length > 0 && itemCount === 0 && sections.headers.length > 0) rows.push({ _tag: "message", text: "- No matching pull requests.", color: colors.muted })
	const bySection = new Map(groups)
	for (const section of sections.headers) {
		rows.push({ _tag: "section", section })
		if (section.error) rows.push({ _tag: "message", text: `  ! ${section.error}`, color: colors.error })
		if (section.collapsed) continue
		const pullRequests = bySection.get(section.id) ?? []
		const numberWidth = groupNumberWidth(pullRequests)
		const ageWidth = groupAgeWidth(pullRequests)
		for (const pullRequest of pullRequests) rows.push({ _tag: "pull-request", pullRequest, numberWidth, ageWidth, compact, showRepository: true })
	}
	return rows
}

export const buildPullRequestListRows = ({
	groups,
	status,
	error,
	filterText,
	loadedCount,
	hasMore,
	isLoadingMore,
	loadingIndicator = "-",
	showTitle = true,
	showRepositoryGroups = true,
	compact = false,
	sections = null,
}: {
	readonly groups: PullRequestGroups
	readonly status: LoadStatus
	readonly error: string | null
	readonly filterText: string
	readonly loadedCount: number
	readonly hasMore: boolean
	readonly isLoadingMore: boolean
	readonly loadingIndicator?: string
	readonly showTitle?: boolean
	readonly showRepositoryGroups?: boolean
	readonly compact?: boolean
	readonly sections?: PullRequestSections | null
}): readonly PullRequestListRow[] => {
	const itemCount = groups.reduce((count, [, pullRequests]) => count + pullRequests.length, 0)
	const rows: PullRequestListRow[] = showTitle ? [{ _tag: "title" }] : []
	if (sections) return buildSectionRows(rows, sections, groups, status, error, filterText, compact)
	if (status === "loading" && itemCount === 0) rows.push({ _tag: "message", text: "- Loading pull requests...", color: colors.muted })
	if (status === "error") rows.push({ _tag: "message", text: `- ${error ?? "Could not load pull requests."}`, color: colors.error })
	if (status === "ready" && itemCount === 0)
		rows.push({ _tag: "message", text: filterText.length > 0 ? "- No matching pull requests." : "- No open pull requests.", color: colors.muted })
	for (const [repository, pullRequests] of groups) {
		if (showRepositoryGroups) rows.push({ _tag: "group", repository, pullRequests })
		const numberWidth = groupNumberWidth(pullRequests)
		const ageWidth = groupAgeWidth(pullRequests)
		for (const pullRequest of pullRequests) rows.push({ _tag: "pull-request", pullRequest, numberWidth, ageWidth, compact })
	}
	if (status === "ready" && itemCount > 0 && (hasMore || isLoadingMore)) {
		rows.push({
			_tag: "load-more",
			text: isLoadingMore ? `${loadingIndicator} Loading more pull requests... (${loadedCount} loaded)` : `↓ Press enter to load more  ·  ${loadedCount} loaded`,
		})
	}
	return rows
}

export const pullRequestListRowIndex = (rows: readonly PullRequestListRow[], url: string | null, loadMoreSelected = false) => {
	if (!url && !loadMoreSelected) return null
	let line = 0
	for (const row of rows) {
		if (row._tag === "pull-request" && row.pullRequest.url === url) return line
		if (row._tag === "load-more" && loadMoreSelected) return line
		line += pullRequestListRowHeight(row)
	}
	return null
}

export const pullRequestListVisualLineCount = (rows: readonly PullRequestListRow[]) => rows.reduce((count, row) => count + pullRequestListRowHeight(row), 0)

const PullRequestRow = ({
	pullRequest,
	selected,
	hovered,
	contentWidth,
	numWidth,
	ageColWidth,
	filterText,
	compact,
	showRepository,
	onSelect,
	onHoverChange,
}: {
	pullRequest: PullRequestItem
	selected: boolean
	hovered: boolean
	contentWidth: number
	numWidth: number
	ageColWidth: number
	filterText: string
	compact: boolean
	showRepository: boolean
	onSelect: () => void
	onHoverChange: (hovered: boolean) => void
}) => {
	const ageText = `${daysOpen(pullRequest.updatedAt)}d`
	const title = pullRequest.title.trim()
	const { reviewWidth, checkWidth, ageWidth, numberWidth, titleWidth } = getRowLayout(contentWidth, numWidth, ageColWidth)
	const rowWidth = reviewWidth + 1 + numberWidth + 1 + titleWidth + checkWidth + ageWidth
	const fillerWidth = Math.max(0, contentWidth - rowWidth)
	const metaIndentWidth = reviewWidth + 1
	const metaWidth = Math.max(8, contentWidth - metaIndentWidth)
	const branchText =
		pullRequest.headRefName === pullRequest.baseRefName
			? null
			: pullRequest.baseRefName === pullRequest.defaultBranchName
				? pullRequest.headRefName
				: `${pullRequest.headRefName} → ${pullRequest.baseRefName}`
	const authorText = showRepository ? `@${pullRequest.author} · ${pullRequest.repository}` : `@${pullRequest.author}`
	const branchWidth = branchText ? Math.max(0, metaWidth - authorText.length - 1) : 0
	const display = pullRequestRowDisplay(pullRequest, selected)

	return (
		<SelectableRow width={contentWidth} selected={selected} hovered={hovered} onSelect={onSelect} onHoverChange={onHoverChange}>
			{(rowBg) => (
				<>
					<TextLine width={contentWidth} fg={display.rowFg} bg={rowBg}>
						<span fg={display.indicatorFg}>{fitCell(reviewIcon(pullRequest), reviewWidth)}</span>
						<span> </span>
						<span fg={display.numberFg}>
							<MatchedCell text={`#${pullRequest.number}`} width={numberWidth} query={filterText} align="right" />
						</span>
						<span> </span>
						<span>
							<MatchedCell text={title} width={titleWidth} query={filterText} />
						</span>
						<span fg={colors.muted}>{fitCell(ageText, ageWidth, "right")}</span>
						<span fg={display.checkFg}>{fitCell(display.checkText, checkWidth, "right")}</span>
						{fillerWidth > 0 ? <span>{" ".repeat(fillerWidth)}</span> : null}
					</TextLine>
					{compact ? null : (
						<TextLine width={contentWidth} fg={colors.muted} bg={rowBg}>
							<span>{" ".repeat(metaIndentWidth)}</span>
							<MatchedCell text={authorText} width={branchText ? authorText.length : metaWidth} query={filterText} />
							{branchText ? <span> </span> : null}
							{branchText ? (
								<span fg={colors.separator}>
									<MatchedCell text={branchText} width={branchWidth} query={filterText} />
								</span>
							) : null}
						</TextLine>
					)}
				</>
			)}
		</SelectableRow>
	)
}

export const PullRequestList = ({
	groups,
	selectedUrl,
	loadMoreSelected = false,
	status,
	error,
	contentWidth,
	filterText,
	loadedCount,
	hasMore,
	isLoadingMore,
	loadingIndicator,
	onSelectPullRequest,
	onSelectLoadMore,
	showTitle = true,
	showRepositoryGroups = true,
	compact = false,
	sections = null,
	onToggleSection,
}: {
	groups: PullRequestGroups
	selectedUrl: string | null
	loadMoreSelected?: boolean
	status: LoadStatus
	error: string | null
	contentWidth: number
	filterText: string
	loadedCount: number
	hasMore: boolean
	isLoadingMore: boolean
	loadingIndicator: string
	onSelectPullRequest: (url: string) => void
	onSelectLoadMore?: () => void
	showTitle?: boolean
	showRepositoryGroups?: boolean
	compact?: boolean
	sections?: PullRequestSections | null
	onToggleSection?: (id: string) => void
}) => {
	const rows = buildPullRequestListRows({
		groups,
		status,
		error,
		filterText,
		loadedCount,
		hasMore,
		isLoadingMore,
		loadingIndicator,
		showTitle,
		showRepositoryGroups,
		compact,
		sections,
	})
	const { isHovered, onHoverChange } = useHoverState<string>()

	return (
		<box width={contentWidth} flexDirection="column">
			{rows.map((row, index) => {
				if (row._tag === "title") return <SectionTitle key="title" title="PULL REQUESTS" />
				if (row._tag === "message") return <PlainLine key={`message-${index}`} text={row.text} fg={row.color} />
				if (row._tag === "load-more")
					return (
						<SelectableRow key="load-more" width={contentWidth} selected={loadMoreSelected} hovered={false} onSelect={() => onSelectLoadMore?.()} onHoverChange={() => {}}>
							{(rowBg) => (
								<TextLine width={contentWidth} fg={colors.muted} bg={rowBg}>
									<span>{row.text}</span>
								</TextLine>
							)}
						</SelectableRow>
					)
				if (row._tag === "section")
					return (
						<SectionHeaderLine
							key={`section-${row.section.id}`}
							section={row.section}
							loadingIndicator={loadingIndicator}
							contentWidth={contentWidth}
							onToggle={() => onToggleSection?.(row.section.id)}
						/>
					)
				if (row._tag === "group") return <GroupTitle key={`group-${row.repository}`} label={row.repository} color={repoColor(row.repository)} filterText={filterText} />

				const pullRequestUrl = row.pullRequest.url
				return (
					<PullRequestRow
						key={pullRequestUrl}
						pullRequest={row.pullRequest}
						selected={pullRequestUrl === selectedUrl}
						hovered={isHovered(pullRequestUrl)}
						contentWidth={contentWidth}
						numWidth={row.numberWidth}
						ageColWidth={row.ageWidth}
						filterText={filterText}
						compact={row.compact}
						showRepository={row.showRepository ?? false}
						onSelect={() => onSelectPullRequest(pullRequestUrl)}
						onHoverChange={onHoverChange(pullRequestUrl)}
					/>
				)
			})}
		</box>
	)
}
