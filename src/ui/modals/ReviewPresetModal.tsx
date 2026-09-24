import { TextAttributes } from "@opentui/core"
import type { ReviewConfig, ReviewPreset } from "../../review/config.js"
import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, StandardModal, standardModalDims, TextLine } from "../primitives.js"
import type { ReviewPresetModalState, ReviewPresetOption } from "./types.js"

const presetDetail = (preset: ReviewPreset) =>
	[
		preset.agent,
		preset.skill ? `skill ${preset.skill}` : null,
		preset.model ? `model ${preset.model}` : null,
		preset.maxBudgetUsd !== null ? `≤ $${preset.maxBudgetUsd}` : null,
		preset.extraPrompt.trim().length > 0 ? "+prompt" : null,
	]
		.filter((part): part is string => part !== null)
		.join(" · ")

/** Picker rows for every configured preset, default first, then alphabetical. */
export const reviewPresetOptions = (config: ReviewConfig): readonly ReviewPresetOption[] =>
	Object.values(config.presets)
		.map((preset) => ({ id: preset.id, detail: presetDetail(preset), isDefault: preset.id === config.defaultPreset }))
		.sort((left, right) => (left.isDefault === right.isDefault ? left.id.localeCompare(right.id) : left.isDefault ? -1 : 1))

export const ReviewPresetModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	readonly state: ReviewPresetModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
}) => {
	const { rowWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, state.presets.length - 1))
	const idWidth = Math.min(Math.max(8, ...state.presets.map((preset) => preset.id.length)), Math.max(8, Math.floor(rowWidth / 3)))
	// Keep the selected row in view when there are more presets than rows.
	const start = Math.max(0, Math.min(selectedIndex - bodyHeight + 1, state.presets.length - bodyHeight))
	const visible = state.presets.slice(Math.max(0, start), Math.max(0, start) + bodyHeight)
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Agent Review Preset"
			subtitle={
				<TextLine>
					<span fg={colors.muted}>Run a read-only review with this preset.</span>
				</TextLine>
			}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "move" },
						{ key: "enter", label: "run" },
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{state.presets.length === 0 ? (
				<TextLine width={rowWidth} fg={colors.muted}>
					<span>{fitCell("No review presets configured.", rowWidth)}</span>
				</TextLine>
			) : null}
			{visible.map((preset, offset) => {
				const index = Math.max(0, start) + offset
				const selected = index === selectedIndex
				const suffix = preset.isDefault ? " (default)" : ""
				const detailWidth = Math.max(1, rowWidth - idWidth - suffix.length - 4)
				return (
					<TextLine key={preset.id} width={rowWidth} bg={selected ? colors.selectedBg : undefined} fg={selected ? colors.selectedText : colors.text}>
						<span fg={selected ? colors.accent : colors.muted}>{selected ? "›" : " "}</span>
						<span> </span>
						<span fg={selected ? colors.accent : colors.count} attributes={selected ? TextAttributes.BOLD : 0}>
							{fitCell(preset.id, idWidth)}
						</span>
						<span fg={colors.muted}>{suffix}</span>
						<span> </span>
						<span fg={colors.muted}>{fitCell(preset.detail, detailWidth)}</span>
					</TextLine>
				)
			})}
			<Filler rows={Math.max(0, bodyHeight - Math.max(1, visible.length))} prefix="review-preset-modal" />
		</StandardModal>
	)
}
