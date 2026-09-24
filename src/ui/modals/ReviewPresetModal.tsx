import { homedir } from "node:os"
import { TextAttributes } from "@opentui/core"
import type { ReviewAgentKind, ReviewConfig, ReviewPreset } from "../../review/config.js"
import { presetFormFields, presetFormLabels, type PresetFormField } from "../../review/presetEdits.js"
import { configPath } from "../../themeStore.js"
import { colors } from "../colors.js"
import { Filler, fitCell, type HintItem, HintRow, PlainLine, StandardModal, standardModalDims, TextLine } from "../primitives.js"
import { presetSuggestions, reviewAgentChoices, SUGGESTION_ROWS } from "./reviewPresetModel.js"
import type { ReviewPresetFormState, ReviewPresetModalState, ReviewPresetOption } from "./types.js"

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
		.map((preset) => ({ id: preset.id, detail: presetDetail(preset), isDefault: preset.id === config.defaultPreset, preset }))
		.sort((left, right) => (left.isDefault === right.isDefault ? left.id.localeCompare(right.id) : left.isDefault ? -1 : 1))

const agentDescriptions: Record<ReviewAgentKind, string> = {
	claude: "Claude Code: skill, model, budget cap",
	codex: "Codex CLI: skill, model",
}

const budgetText = (preset: ReviewPreset) => (preset.maxBudgetUsd === null ? "—" : `$${preset.maxBudgetUsd}`)

/** `~/…` for paths under the home directory, so the footer stays short. */
const displayPath = (path: string) => {
	const home = homedir()
	return home.length > 1 && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

const modeHints = (state: ReviewPresetModalState): readonly HintItem[] => {
	switch (state.mode) {
		case "list":
			return [
				{ key: "enter", label: "run" },
				{ key: "e", label: "edit" },
				{ key: "n", label: "new" },
				{ key: "d", label: "default" },
				{ key: "x", label: "delete" },
				{ key: "esc", label: "close" },
			]
		case "edit":
			return [
				{ key: "↑↓", label: "field" },
				{ key: "tab", label: "complete" },
				{ key: "enter", label: "save" },
				{ key: "esc", label: "cancel" },
			]
		case "pickAgent":
			return [
				{ key: "↑↓", label: "agent" },
				{ key: "enter", label: "next" },
				{ key: "esc", label: "cancel" },
			]
		case "name":
			return [
				{ key: "enter", label: "next" },
				{ key: "ctrl-u", label: "clear" },
				{ key: "esc", label: "cancel" },
			]
		case "confirmDelete":
			return [
				{ key: "y", label: "delete" },
				{ key: "n", label: "keep" },
				{ key: "esc", label: "cancel" },
			]
	}
}

const placeholder = (form: ReviewPresetFormState, field: PresetFormField): string => {
	switch (field) {
		case "skill":
			return "none"
		case "model":
			return form.agent === "claude" ? "default (sonnet, opus, haiku)" : "default"
		case "maxBudgetUsd":
			return form.agent === "claude" ? "none" : "n/a (claude only)"
		case "extraPrompt":
			return "none"
	}
}

const LABEL_WIDTH = 9

const FormRows = ({ state, rowWidth, bodyHeight }: { readonly state: ReviewPresetModalState; readonly rowWidth: number; readonly bodyHeight: number }) => {
	const form = state.form!
	const suggestions = presetSuggestions(state).slice(0, SUGGESTION_ROWS)
	const valueWidth = Math.max(1, rowWidth - LABEL_WIDTH - 3)
	const heading = `${form.isNew ? "New" : "Edit"} ${form.agent} preset ${form.presetId}`
	const suggestionWidth = Math.min(28, Math.max(1, ...suggestions.map((suggestion) => suggestion.value.length)))
	const rows = [
		<TextLine key="heading" width={rowWidth} fg={colors.muted}>
			<span> </span>
			<span fg={colors.accent} attributes={TextAttributes.BOLD}>
				{fitCell(heading, rowWidth - 1)}
			</span>
		</TextLine>,
		...presetFormFields.map((field) => {
			const focused = field === form.field
			const value = form.values[field]
			const shown = value.length > 0 ? `${value}${focused ? "▏" : ""}` : focused ? `▏${placeholder(form, field)}` : placeholder(form, field)
			return (
				<TextLine key={field} width={rowWidth} bg={focused ? colors.selectedBg : undefined}>
					<span fg={focused ? colors.accent : colors.muted}>{focused ? "›" : " "}</span>
					<span> </span>
					<span fg={focused ? colors.accent : colors.muted}>{fitCell(presetFormLabels[field], LABEL_WIDTH)}</span>
					<span> </span>
					<span fg={value.length > 0 ? (focused ? colors.selectedText : colors.text) : colors.muted}>{fitCell(shown, valueWidth)}</span>
				</TextLine>
			)
		}),
		...suggestions.map((suggestion, index) => {
			const active = form.completionQuery !== null && index === form.suggestionIndex
			return (
				<TextLine key={`suggestion-${suggestion.value}`} width={rowWidth}>
					<span>{" ".repeat(LABEL_WIDTH + 3)}</span>
					<span fg={active ? colors.accent : colors.count}>{fitCell(suggestion.value, suggestionWidth)}</span>
					<span fg={colors.muted}>{fitCell(suggestion.detail ? `  ${suggestion.detail}` : "", Math.max(0, rowWidth - LABEL_WIDTH - 3 - suggestionWidth))}</span>
				</TextLine>
			)
		}),
	]
	return (
		<>
			{rows.slice(0, Math.max(0, bodyHeight - 1))}
			<Filler rows={Math.max(0, bodyHeight - 1 - rows.length)} prefix="review-preset-form" />
		</>
	)
}

const ListRows = ({ state, rowWidth, bodyHeight }: { readonly state: ReviewPresetModalState; readonly rowWidth: number; readonly bodyHeight: number }) => {
	const listHeight = Math.max(1, bodyHeight - 1)
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, state.presets.length - 1))
	const idWidth = Math.min(Math.max(8, ...state.presets.map((preset) => preset.id.length)), Math.max(8, Math.floor(rowWidth / 4)))
	// marker, id, agent, skill, model, budget, default: fixed columns first, the rest split skill/model.
	const agentWidth = 6
	const budgetWidth = 6
	const defaultWidth = 7
	const flexible = Math.max(8, rowWidth - 2 - idWidth - agentWidth - budgetWidth - defaultWidth - 10)
	const skillWidth = Math.ceil(flexible * 0.6)
	const modelWidth = Math.max(1, flexible - skillWidth)
	const start = Math.max(0, Math.min(selectedIndex - listHeight + 1, state.presets.length - listHeight))
	const visible = state.presets.slice(start, start + listHeight)
	return (
		<>
			{state.presets.length === 0 ? (
				<TextLine width={rowWidth} fg={colors.muted}>
					<span>{fitCell(" No review presets configured.", rowWidth)}</span>
				</TextLine>
			) : null}
			{visible.map((option, offset) => {
				const selected = start + offset === selectedIndex
				const { preset } = option
				const cell = (text: string, width: number, fg: string) => <span fg={fg}>{`  ${fitCell(text, width)}`}</span>
				return (
					<TextLine key={option.id} width={rowWidth} bg={selected ? colors.selectedBg : undefined} fg={selected ? colors.selectedText : colors.text}>
						<span fg={selected ? colors.accent : colors.muted}>{selected ? "›" : " "}</span>
						<span> </span>
						<span fg={selected ? colors.accent : colors.count} attributes={selected ? TextAttributes.BOLD : 0}>
							{fitCell(option.id, idWidth)}
						</span>
						{cell(preset.agent, agentWidth, colors.muted)}
						{cell(preset.skill ?? "none", skillWidth, preset.skill ? colors.text : colors.muted)}
						{cell(preset.model ?? "default", modelWidth, preset.model ? colors.text : colors.muted)}
						{cell(budgetText(preset), budgetWidth, preset.maxBudgetUsd === null ? colors.muted : colors.text)}
						{cell(option.isDefault ? "default" : "", defaultWidth, colors.status.approved)}
					</TextLine>
				)
			})}
			<Filler rows={Math.max(0, listHeight - Math.max(1, visible.length))} prefix="review-preset-modal" />
		</>
	)
}

const AgentRows = ({ state, rowWidth, bodyHeight }: { readonly state: ReviewPresetModalState; readonly rowWidth: number; readonly bodyHeight: number }) => (
	<>
		<TextLine width={rowWidth} fg={colors.muted}>
			<span>{fitCell(" New preset: pick the agent", rowWidth)}</span>
		</TextLine>
		{reviewAgentChoices.map((agent) => {
			const selected = agent === state.newAgent
			return (
				<TextLine key={agent} width={rowWidth} bg={selected ? colors.selectedBg : undefined}>
					<span fg={selected ? colors.accent : colors.muted}>{selected ? "›" : " "}</span>
					<span> </span>
					<span fg={selected ? colors.accent : colors.count} attributes={selected ? TextAttributes.BOLD : 0}>
						{fitCell(agent, 8)}
					</span>
					<span fg={colors.muted}>{fitCell(agentDescriptions[agent], Math.max(1, rowWidth - 10))}</span>
				</TextLine>
			)
		})}
		<Filler rows={Math.max(0, bodyHeight - 1 - 1 - reviewAgentChoices.length)} prefix="review-preset-agent" />
	</>
)

const NameRows = ({ state, rowWidth, bodyHeight }: { readonly state: ReviewPresetModalState; readonly rowWidth: number; readonly bodyHeight: number }) => (
	<>
		<TextLine width={rowWidth} fg={colors.muted}>
			<span>{fitCell(` New ${state.newAgent} preset: name it`, rowWidth)}</span>
		</TextLine>
		<TextLine width={rowWidth} bg={colors.selectedBg}>
			<span fg={colors.accent}>›</span>
			<span> </span>
			<span fg={colors.accent}>{fitCell("name", LABEL_WIDTH)}</span>
			<span> </span>
			<span fg={state.newName.length > 0 ? colors.selectedText : colors.muted}>
				{fitCell(state.newName.length > 0 ? `${state.newName}▏` : "▏e.g. deep-review", Math.max(1, rowWidth - LABEL_WIDTH - 3))}
			</span>
		</TextLine>
		<Filler rows={Math.max(0, bodyHeight - 3)} prefix="review-preset-name" />
	</>
)

/** Bottom body row: the error, the delete question, or a quiet hint. */
const statusLine = (state: ReviewPresetModalState): { readonly text: string; readonly fg: string } => {
	if (state.error) return { text: state.error, fg: colors.error }
	if (state.mode === "confirmDelete") return { text: `Delete preset ${state.presets[state.selectedIndex]?.id ?? ""}? y deletes, n keeps.`, fg: colors.status.changes }
	if (state.mode === "edit") return { text: "Empty fields use the agent's defaults. Runs stay read-only.", fg: colors.muted }
	return { text: "Runs are read-only reviews of the selected pull request.", fg: colors.muted }
}

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
	const { rowWidth, contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const status = statusLine(state)
	const path = `config ${displayPath(configPath())}`
	const body =
		state.mode === "edit" && state.form ? (
			<FormRows state={state} rowWidth={rowWidth} bodyHeight={bodyHeight} />
		) : state.mode === "pickAgent" ? (
			<AgentRows state={state} rowWidth={rowWidth} bodyHeight={bodyHeight} />
		) : state.mode === "name" ? (
			<NameRows state={state} rowWidth={rowWidth} bodyHeight={bodyHeight} />
		) : (
			<ListRows state={state} rowWidth={rowWidth} bodyHeight={bodyHeight} />
		)
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Agent Review Presets"
			subtitle={<HintRow items={modeHints(state)} />}
			footer={<PlainLine text={fitCell(path, contentWidth)} fg={colors.muted} />}
		>
			{body}
			<PlainLine text={fitCell(` ${status.text}`, rowWidth)} fg={status.fg} />
		</StandardModal>
	)
}
