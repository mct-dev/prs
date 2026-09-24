import type { TerminalColors } from "@opentui/core"
import { isHexColor } from "./ui/colors.js"

export interface SystemThemeReloadConfig {
	readonly debounceMs: number
	readonly readTimeoutMs: number
	readonly maxAttempts: number
	readonly retryDelayMs: number
}

export const DEFAULT_SYSTEM_THEME_RELOAD_CONFIG: SystemThemeReloadConfig = {
	debounceMs: 200,
	readTimeoutMs: 500,
	maxAttempts: 4,
	retryDelayMs: 200,
}

export type SystemThemeReloadEvent =
	| { readonly kind: "request"; readonly epoch: number }
	| { readonly kind: "debounce-fire"; readonly epoch: number }
	| {
			readonly kind: "attempt"
			readonly epoch: number
			readonly attempt: number
			readonly complete: boolean
			readonly changed: boolean
			readonly signature: string | null
	  }
	| { readonly kind: "applied"; readonly epoch: number; readonly attempt: number; readonly signature: string }
	| {
			readonly kind: "skipped"
			readonly epoch: number
			readonly reason: "disabled" | "cancelled" | "incomplete" | "unchanged"
			readonly attempts: number
	  }
	| { readonly kind: "error"; readonly epoch: number; readonly error: unknown }

export interface SystemThemeReloadDeps {
	readonly readPalette: (timeoutMs: number) => Promise<TerminalColors>
	readonly applyColors: (colors: TerminalColors) => void
	readonly notify: () => void
	readonly isAutoReloadEnabled: () => Promise<boolean>
	readonly setTimer: (fn: () => void, ms: number) => unknown
	readonly clearTimer: (handle: unknown) => void
	readonly delay: (ms: number) => Promise<void>
	readonly config?: Partial<SystemThemeReloadConfig>
	readonly onEvent?: (event: SystemThemeReloadEvent) => void
}

export interface SystemThemeReloader {
	requestReload(): void
	primeBaseline(): Promise<void>
	dispose(): void
}

export const paletteSignature = (colors: TerminalColors): string =>
	[colors.defaultForeground ?? "", colors.defaultBackground ?? "", ...colors.palette.slice(0, 16).map((slot) => slot ?? "")].join("|")

export const hasCompletePalette = (colors: TerminalColors): boolean =>
	isHexColor(colors.defaultForeground) && isHexColor(colors.defaultBackground) && colors.palette.length >= 16 && colors.palette.slice(0, 16).every(isHexColor)

export const createSystemThemeReloader = (deps: SystemThemeReloadDeps): SystemThemeReloader => {
	const config = { ...DEFAULT_SYSTEM_THEME_RELOAD_CONFIG, ...deps.config }
	let epoch = 0
	let debounceHandle: unknown = null
	let lastAppliedSignature: string | null = null

	const emit = (event: SystemThemeReloadEvent) => {
		if (deps.onEvent) deps.onEvent(event)
	}

	const cancelDebounce = () => {
		if (debounceHandle !== null) {
			deps.clearTimer(debounceHandle)
			debounceHandle = null
		}
	}

	const runReload = async (token: number) => {
		const isCancelled = () => token !== epoch

		const enabled = await deps.isAutoReloadEnabled()
		if (isCancelled()) {
			emit({ kind: "skipped", epoch: token, reason: "cancelled", attempts: 0 })
			return
		}
		if (!enabled) {
			emit({ kind: "skipped", epoch: token, reason: "disabled", attempts: 0 })
			return
		}

		for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
			const palette = await deps.readPalette(config.readTimeoutMs)
			if (isCancelled()) {
				emit({ kind: "skipped", epoch: token, reason: "cancelled", attempts: attempt })
				return
			}

			const complete = hasCompletePalette(palette)
			const signature = complete ? paletteSignature(palette) : null
			const changed = signature !== null && signature !== lastAppliedSignature
			emit({ kind: "attempt", epoch: token, attempt, complete, changed, signature })

			if (complete && changed && signature !== null) {
				deps.applyColors(palette)
				deps.notify()
				lastAppliedSignature = signature
				emit({ kind: "applied", epoch: token, attempt, signature })
				return
			}

			if (attempt < config.maxAttempts) {
				await deps.delay(config.retryDelayMs)
				if (isCancelled()) {
					emit({ kind: "skipped", epoch: token, reason: "cancelled", attempts: attempt })
					return
				}
			}
		}

		const reason = lastAppliedSignature === null ? "incomplete" : "unchanged"
		emit({ kind: "skipped", epoch: token, reason, attempts: config.maxAttempts })
	}

	return {
		async primeBaseline() {
			const palette = await deps.readPalette(config.readTimeoutMs)
			if (hasCompletePalette(palette)) {
				lastAppliedSignature = paletteSignature(palette)
			}
		},
		requestReload() {
			epoch += 1
			const token = epoch
			emit({ kind: "request", epoch: token })
			cancelDebounce()
			debounceHandle = deps.setTimer(() => {
				debounceHandle = null
				emit({ kind: "debounce-fire", epoch: token })
				void runReload(token).catch((error) => emit({ kind: "error", epoch: token, error }))
			}, config.debounceMs)
		},
		dispose() {
			cancelDebounce()
			epoch += 1
		},
	}
}
