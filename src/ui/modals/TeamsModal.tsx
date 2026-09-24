import { TextAttributes } from "@opentui/core"
import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, StandardModal, standardModalDims, TextLine } from "../primitives.js"
import type { TeamsModalState } from "./types.js"

const people = (members: number | null) => (members === null ? "" : members === 1 ? "1 person" : `${members} people`)

export const TeamsModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	readonly state: TeamsModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
}) => {
	const { rowWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, state.teams.length - 1))
	const countWidth = Math.max(0, ...state.teams.map((team) => people(team.members).length))
	const slugWidth = Math.max(8, Math.min(Math.max(8, ...state.teams.map((team) => team.slug.length)), rowWidth - countWidth - 8))
	const start = Math.max(0, Math.min(selectedIndex - bodyHeight + 1, state.teams.length - bodyHeight))
	const visible = state.teams.slice(start, start + bodyHeight)
	const message = state.error ?? (state.loading ? "Loading your teams…" : state.teams.length === 0 ? "You aren't on any teams GitHub shows to prs." : null)
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="My Teams"
			headerRight={{ text: state.loading ? "" : `${state.chosen.length} chosen`, pending: state.loading }}
			subtitle={
				<TextLine>
					<span fg={colors.muted}>{fitCell("Sets {my_teams} in sections.yaml.", rowWidth)}</span>
				</TextLine>
			}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "move" },
						{ key: "space", label: "toggle" },
						{ key: "enter", label: "save" },
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{message ? (
				<TextLine width={rowWidth} fg={state.error ? colors.error : colors.muted}>
					<span>{fitCell(message, rowWidth)}</span>
				</TextLine>
			) : null}
			{visible.map((team, offset) => {
				const index = start + offset
				const selected = index === selectedIndex
				const checked = state.chosen.includes(team.slug)
				const name = team.name !== team.slug && team.name !== team.slug.split("/").pop() ? team.name : ""
				const nameWidth = Math.max(0, rowWidth - slugWidth - countWidth - 9)
				return (
					<TextLine key={team.slug} width={rowWidth} bg={selected ? colors.selectedBg : undefined} fg={selected ? colors.selectedText : colors.text}>
						<span fg={selected ? colors.accent : colors.muted}>{selected ? "›" : " "}</span>
						<span fg={checked ? colors.accent : colors.muted}>{checked ? " [x] " : " [ ] "}</span>
						<span fg={selected ? colors.accent : colors.text} attributes={checked ? TextAttributes.BOLD : 0}>
							{fitCell(team.slug, slugWidth)}
						</span>
						<span> </span>
						<span fg={colors.muted}>{fitCell(name, nameWidth)}</span>
						<span> </span>
						<span fg={colors.count}>{fitCell(people(team.members), countWidth, "right")}</span>
					</TextLine>
				)
			})}
			<Filler rows={Math.max(0, bodyHeight - visible.length - (message ? 1 : 0))} prefix="teams-modal" />
		</StandardModal>
	)
}
