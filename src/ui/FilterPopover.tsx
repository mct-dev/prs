import { useAtomValue } from "@effect/atom-react"
import { riskUnknownNote, usesRiskFilter } from "../filter/suggest.js"
import { colors } from "./colors.js"
import { filterDraftAtom, filterModeAtom } from "./filter/atoms.js"
import { filterPopoverAtom } from "./filter/popover.js"
import { displayedPullRequestsAtom, filteredPullRequestsAtom, unknownRiskCountAtom } from "./pullRequests/atoms.js"
import { fitCell, ModalFrame, TextLine, trimCell } from "./primitives.js"

/**
 * Autocomplete for the `/` prompt, floating just above the footer while
 * filter mode is on: suggestions, a live match count and soft warnings.
 */
export const FilterPopover = ({ terminalWidth, terminalHeight }: { readonly terminalWidth: number; readonly terminalHeight: number }) => {
	const filterMode = useAtomValue(filterModeAtom)
	const draft = useAtomValue(filterDraftAtom)
	const view = useAtomValue(filterPopoverAtom)
	const total = useAtomValue(displayedPullRequestsAtom).length
	const matching = useAtomValue(filteredPullRequestsAtom).length
	const unknownRisk = useAtomValue(unknownRiskCountAtom)
	if (!filterMode || view.dismissed) return null

	const items = view.suggestions.items
	const notes = view.warnings.map((warning) => ({ text: `! ${warning}`, fg: colors.error }))
	if (usesRiskFilter(draft) && unknownRisk > 0) notes.push({ text: riskUnknownNote(unknownRisk), fg: colors.muted })

	const width = Math.max(30, Math.min(72, terminalWidth - 2))
	const inner = width - 2
	const labelWidth = Math.min(28, Math.max(8, ...items.map((item) => item.label.length + 2)))
	const status = draft.trim().length === 0 ? `${total} PRs` : `matches ${matching} of ${total} PRs`
	const keys = items.length > 0 ? "tab complete · ↑↓ pick · esc close" : "enter apply · esc cancel"
	const rows = items.length + notes.length + 1
	const height = rows + 2
	// Bottom border sits on the divider above the footer prompt.
	const top = Math.max(0, terminalHeight - 1 - height)

	return (
		<ModalFrame left={0} top={top} width={width} height={height}>
			{items.map((item, index) => {
				const selected = index === view.index
				const bg = selected ? colors.selectedBg : colors.modalBackground
				const detail = item.count !== undefined ? `${item.count} PR${item.count === 1 ? "" : "s"}` : item.description
				return (
					<TextLine key={`${item.kind}:${item.label}`} width={inner} bg={bg}>
						<span fg={selected ? colors.accent : colors.muted}>{selected ? "›" : " "}</span>
						<span fg={item.kind === "recent" ? colors.muted : selected ? colors.selectedText : colors.text}>{fitCell(item.label, labelWidth)}</span>
						<span fg={colors.muted}>{fitCell(detail, Math.max(0, inner - labelWidth - 1))}</span>
					</TextLine>
				)
			})}
			{notes.map((note) => (
				<TextLine key={note.text} width={inner} bg={colors.modalBackground}>
					<span fg={note.fg}>{fitCell(` ${note.text}`, inner)}</span>
				</TextLine>
			))}
			<TextLine width={inner} bg={colors.modalBackground}>
				<span fg={colors.count}>{` ${trimCell(status, inner - 1)}`}</span>
				<span fg={colors.muted}>{fitCell(keys, Math.max(0, inner - status.length - 1), "right")}</span>
			</TextLine>
		</ModalFrame>
	)
}
