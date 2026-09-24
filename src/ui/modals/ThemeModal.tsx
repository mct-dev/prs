import { colors, filterThemeDefinitions, oppositeThemeTone, themeDefinitions } from "../colors.js"
import { centerCell, Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { ThemeModalState } from "./types.js"

export const ThemeModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: ThemeModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight: maxVisible, rowWidth } = standardModalDims(modalWidth, modalHeight)
	const filteredThemes = filterThemeDefinitions(state.query, state.tone)
	const selectedThemeId = state.mode === "fixed" ? state.fixedTheme : state.tone === "dark" ? state.darkTheme : state.lightTheme
	const activeIndex = filteredThemes.findIndex((theme) => theme.id === selectedThemeId)
	const selectedIndex = Math.max(0, activeIndex)
	const selectedTheme = filteredThemes[selectedIndex] ?? themeDefinitions.find((theme) => theme.id === selectedThemeId) ?? themeDefinitions[0]!
	const scrollStart = Math.min(Math.max(0, filteredThemes.length - maxVisible), Math.max(0, selectedIndex - maxVisible + 1))
	const visibleThemes = filteredThemes.slice(scrollStart, scrollStart + maxVisible)
	const countText = `${filteredThemes.length === 0 ? 0 : selectedIndex + 1}/${filteredThemes.length}`
	const subtitleText = state.filterMode ? (state.query.length > 0 ? state.query : "type to filter themes") : selectedTheme.description
	const queryPrefix = "/ "
	const subtitleWidth = Math.max(1, contentWidth - (state.filterMode ? queryPrefix.length : 0))
	const messageTopRows = Math.max(0, Math.floor((maxVisible - 1) / 2))
	const messageBottomRows = Math.max(0, maxVisible - messageTopRows - 1)
	const toneLabel = state.tone === "dark" ? "Dark" : "Light"
	const nextToneLabel = oppositeThemeTone(state.tone)
	const selectedDarkTheme = themeDefinitions.find((theme) => theme.id === state.darkTheme)
	const selectedLightTheme = themeDefinitions.find((theme) => theme.id === state.lightTheme)
	const fixedTheme = themeDefinitions.find((theme) => theme.id === state.fixedTheme)
	const modeSummary =
		state.mode === "fixed"
			? `Fixed: ${fixedTheme?.name ?? state.fixedTheme}`
			: `Follow System: Dark ${selectedDarkTheme?.name ?? state.darkTheme}, Light ${selectedLightTheme?.name ?? state.lightTheme}`

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={state.mode === "fixed" ? `${toneLabel} Themes` : `${toneLabel} System Theme`}
			headerRight={{ text: countText }}
			subtitle={
				state.filterMode ? (
					<TextLine>
						<span fg={colors.count}>{queryPrefix}</span>
						<span fg={state.query.length > 0 ? colors.text : colors.muted}>{fitCell(subtitleText, subtitleWidth)}</span>
					</TextLine>
				) : (
					<PlainLine text={fitCell(state.mode === "fixed" ? `${modeSummary} - ${subtitleText}` : modeSummary, subtitleWidth)} fg={colors.muted} />
				)
			}
			footer={
				<HintRow
					items={[
						{ key: "m", label: state.mode === "fixed" ? "follow system" : "fixed" },
						{ key: "tab", label: `${nextToneLabel} mode` },
						{ key: "enter", label: "save" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{visibleThemes.length === 0 ? (
				<>
					<Filler rows={messageTopRows} prefix="top" />
					<PlainLine text={centerCell("No matching themes", rowWidth)} fg={colors.muted} />
					<Filler rows={messageBottomRows} prefix="bottom" />
				</>
			) : (
				visibleThemes.map((theme, index) => {
					const actualIndex = scrollStart + index
					const isSelected = actualIndex === selectedIndex
					const isActive = theme.id === selectedThemeId
					const marker = isActive ? "✓" : " "
					const swatchWidth = 6
					const nameWidth = Math.max(1, rowWidth - swatchWidth - 3)

					return (
						<TextLine key={theme.id} bg={isSelected ? colors.selectedBg : undefined} fg={isSelected ? colors.selectedText : colors.text}>
							<span fg={isActive ? colors.status.passing : colors.muted}>{marker}</span>
							<span> </span>
							<span>{fitCell(theme.name, nameWidth)}</span>
							<span bg={theme.colors.background}> </span>
							<span bg={theme.colors.modalBackground}> </span>
							<span bg={theme.colors.accent}> </span>
							<span bg={theme.colors.status.passing}> </span>
							<span bg={theme.colors.status.failing}> </span>
							<span bg={theme.colors.status.review}> </span>
						</TextLine>
					)
				})
			)}
		</StandardModal>
	)
}
