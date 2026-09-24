import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Effect } from "effect"
import { useEffect, useRef } from "react"
import { errorMessage } from "../../errors.js"
import { detectSystemAppearance } from "../../systemAppearance.js"
import { fixedThemeConfig, resolveThemeId, systemThemeConfigForTheme, type ThemeConfig, themeConfigWithSelection, type ThemeMode } from "../../themeConfig.js"
import { saveStoredThemeConfig } from "../../themeStore.js"
import { filterThemeDefinitions, pairedThemeId, setActiveTheme, themeDefinitions, type ThemeId, type ThemeTone, themeToneForThemeId } from "../colors.js"
import type { ThemeModalState } from "../modals.js"
import { systemAppearanceAtom, themeConfigAtom, themeIdAtom } from "./atoms.js"

const SYSTEM_APPEARANCE_POLL_MS = 1000

const wrapIndex = (index: number, length: number) => (length === 0 ? 0 : ((index % length) + length) % length)

export interface UseThemeModalInput {
	readonly themeModal: ThemeModalState
	readonly setThemeModal: (next: ThemeModalState | ((prev: ThemeModalState) => ThemeModalState)) => void
	readonly closeActiveModal: () => void
	readonly flashNotice: (message: string) => void
}

export interface UseThemeModalResult {
	readonly openThemeModal: () => void
	readonly closeThemeModal: (confirm: boolean) => void
	readonly previewTheme: (id: ThemeId) => void
	readonly moveThemeSelection: (delta: number) => void
	readonly updateThemeQuery: (query: string, options?: { readonly previewFirst?: boolean; readonly filterMode?: boolean }) => void
	readonly toggleThemeTone: () => void
	readonly toggleThemeMode: () => void
	readonly editThemeQuery: (transform: (query: string) => string) => void
}

/**
 * Owns the theme modal state machine: open → preview transient changes →
 * confirm-and-persist or cancel-and-revert. Also runs system-appearance
 * polling so theme follows OS dark/light mode while the user has the modal
 * open. The four mirror-refs (themeId, themeConfig, systemAppearance,
 * themeModal) live entirely inside this hook so the preview/confirm protocol
 * is a single seam.
 */
export const useThemeModal = ({ themeModal, setThemeModal, closeActiveModal, flashNotice }: UseThemeModalInput): UseThemeModalResult => {
	const themeConfig = useAtomValue(themeConfigAtom)
	const setThemeConfig = useAtomSet(themeConfigAtom)
	const systemAppearance = useAtomValue(systemAppearanceAtom)
	const setSystemAppearance = useAtomSet(systemAppearanceAtom)
	const themeId = useAtomValue(themeIdAtom)
	const setThemeId = useAtomSet(themeIdAtom)

	const themeIdRef = useRef(themeId)
	const themeConfigRef = useRef(themeConfig)
	const systemAppearanceRef = useRef(systemAppearance)
	const themeModalRef = useRef(themeModal)
	themeIdRef.current = themeId
	themeConfigRef.current = themeConfig
	systemAppearanceRef.current = systemAppearance
	themeModalRef.current = themeModal

	const previewActiveTheme = (id: ThemeId) => {
		setActiveTheme(id)
		themeIdRef.current = id
		setThemeId(id)
	}

	const applyThemeConfig = (config: ThemeConfig, appearance: ThemeTone = systemAppearanceRef.current) => {
		themeConfigRef.current = config
		setThemeConfig(config)
		previewActiveTheme(resolveThemeId(config, appearance))
	}

	// System-appearance polling: while themeConfig.mode === "system", re-check
	// the OS appearance and re-resolve the theme id when it flips.
	const enabled = themeConfig.mode === "system"
	useEffect(() => {
		if (!enabled) return
		let cancelled = false
		const refresh = () => {
			void detectSystemAppearance().then((appearance) => {
				if (cancelled || appearance === systemAppearanceRef.current) return
				systemAppearanceRef.current = appearance
				setSystemAppearance(appearance)
				previewActiveTheme(resolveThemeId(themeConfigRef.current, appearance))
			})
		}
		const interval = globalThis.setInterval(refresh, SYSTEM_APPEARANCE_POLL_MS)
		refresh()
		return () => {
			cancelled = true
			globalThis.clearInterval(interval)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled])

	const openThemeModal = () => {
		const systemConfig = themeConfig.mode === "system" ? themeConfig : systemThemeConfigForTheme(themeConfig.theme)
		setThemeModal({
			query: "",
			filterMode: false,
			mode: themeConfig.mode,
			tone: themeConfig.mode === "system" ? systemAppearance : themeToneForThemeId(themeId),
			fixedTheme: themeConfig.mode === "fixed" ? themeConfig.theme : themeId,
			darkTheme: systemConfig.darkTheme,
			lightTheme: systemConfig.lightTheme,
			initialThemeConfig: themeConfig,
		})
	}

	const themeConfigFromModal = (state: ThemeModalState): ThemeConfig =>
		state.mode === "fixed" ? fixedThemeConfig(state.fixedTheme) : { mode: "system", darkTheme: state.darkTheme, lightTheme: state.lightTheme }

	const closeThemeModal = (confirm: boolean) => {
		if (!confirm) {
			applyThemeConfig(themeModal.initialThemeConfig)
		} else {
			const nextConfig = themeConfigFromModal(themeModal)
			applyThemeConfig(nextConfig)
			void Effect.runPromise(saveStoredThemeConfig(nextConfig)).catch((error) => flashNotice(errorMessage(error)))
			const selectedTheme = themeDefinitions.find((theme) => theme.id === resolveThemeId(nextConfig, systemAppearanceRef.current))
			flashNotice(nextConfig.mode === "system" ? "Theme: Follow System" : `Theme: ${selectedTheme?.name ?? themeIdRef.current}`)
		}
		closeActiveModal()
	}

	const previewTheme = (id: ThemeId) => {
		const current = themeModalRef.current
		const nextConfig = themeConfigWithSelection(themeConfigFromModal(current), id, current.tone)
		const next = {
			...current,
			fixedTheme: nextConfig.mode === "fixed" ? nextConfig.theme : current.fixedTheme,
			darkTheme: nextConfig.mode === "system" ? nextConfig.darkTheme : current.darkTheme,
			lightTheme: nextConfig.mode === "system" ? nextConfig.lightTheme : current.lightTheme,
		}
		themeModalRef.current = next
		setThemeModal(next)
		previewActiveTheme(id)
	}

	const moveThemeSelection = (delta: number) => {
		const current = themeModalRef.current
		const filteredThemes = filterThemeDefinitions(current.query, current.tone)
		if (filteredThemes.length === 0) return
		const selectedThemeId = current.mode === "fixed" ? current.fixedTheme : current.tone === "dark" ? current.darkTheme : current.lightTheme
		const currentIndex = Math.max(
			0,
			filteredThemes.findIndex((theme) => theme.id === selectedThemeId),
		)
		const selectedIndex = wrapIndex(currentIndex + delta, filteredThemes.length)
		if (selectedIndex === currentIndex) return
		const theme = filteredThemes[selectedIndex]
		if (theme) previewTheme(theme.id)
	}

	const updateThemeQuery = (query: string, options: { readonly previewFirst?: boolean; readonly filterMode?: boolean } = {}) => {
		const current = themeModalRef.current
		const next = {
			...current,
			query,
			filterMode: options.filterMode ?? current.filterMode,
		}
		if (next.query === current.query && next.filterMode === current.filterMode) return

		themeModalRef.current = next
		setThemeModal(next)

		if (options.previewFirst && query.trim().length > 0) {
			const firstTheme = filterThemeDefinitions(query, next.tone)[0]
			if (firstTheme) previewTheme(firstTheme.id)
		}
	}

	const toggleThemeTone = () => {
		const current = themeModalRef.current
		const tone: ThemeTone = current.tone === "dark" ? "light" : "dark"
		const next = { ...current, query: "", filterMode: false, tone }
		themeModalRef.current = next
		setThemeModal(next)

		const selectedThemeId =
			current.mode === "system" ? (tone === "dark" ? current.darkTheme : current.lightTheme) : (pairedThemeId(current.fixedTheme, tone) ?? filterThemeDefinitions("", tone)[0]?.id)
		const nextThemeId = selectedThemeId ?? filterThemeDefinitions("", tone)[0]?.id
		if (nextThemeId) previewTheme(nextThemeId)
	}

	const toggleThemeMode = () => {
		const current = themeModalRef.current
		const mode: ThemeMode = current.mode === "fixed" ? "system" : "fixed"
		const next = { ...current, query: "", filterMode: false, mode }
		themeModalRef.current = next
		setThemeModal(next)
		previewActiveTheme(resolveThemeId(themeConfigFromModal(next), systemAppearanceRef.current))
	}

	const editThemeQuery = (transform: (query: string) => string) => {
		updateThemeQuery(transform(themeModalRef.current.query), { previewFirst: true })
	}

	return {
		openThemeModal,
		closeThemeModal,
		previewTheme,
		moveThemeSelection,
		updateThemeQuery,
		toggleThemeTone,
		toggleThemeMode,
		editThemeQuery,
	}
}
