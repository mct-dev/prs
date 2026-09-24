export type ReviewAgentKind = "claude" | "codex"

export interface ReviewPreset {
	readonly id: string
	readonly agent: ReviewAgentKind
	/** Skill name the local agent resolves, e.g. `review` or `my-plugin:review`. */
	readonly skill: string | null
	readonly model: string | null
	/** Claude only: hard spend cap passed as `--max-budget-usd`. */
	readonly maxBudgetUsd: number | null
	readonly extraPrompt: string
	/** Binary override; defaults to the agent name on PATH. */
	readonly command: string | null
}

export interface ReviewConfig {
	readonly defaultPreset: string
	readonly concurrency: number
	readonly timeoutMs: number
	readonly presets: Readonly<Record<string, ReviewPreset>>
}

export const DEFAULT_REVIEW_TIMEOUT_MINUTES = 20
export const DEFAULT_REVIEW_CONCURRENCY = 2

const defaultPresets: Readonly<Record<string, ReviewPreset>> = {
	claude: { id: "claude", agent: "claude", skill: "review", model: null, maxBudgetUsd: 3, extraPrompt: "", command: null },
	codex: { id: "codex", agent: "codex", skill: null, model: null, maxBudgetUsd: null, extraPrompt: "", command: null },
}

export const defaultReviewConfig: ReviewConfig = {
	defaultPreset: "claude",
	concurrency: DEFAULT_REVIEW_CONCURRENCY,
	timeoutMs: DEFAULT_REVIEW_TIMEOUT_MINUTES * 60_000,
	presets: defaultPresets,
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const nonEmptyString = (value: unknown): string | null => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null)

const positiveNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null)

const isAgentKind = (value: unknown): value is ReviewAgentKind => value === "claude" || value === "codex"

const parsePreset = (id: string, raw: unknown, base: ReviewPreset | undefined): ReviewPreset | null => {
	if (!isRecord(raw)) return base ?? null
	const agent = isAgentKind(raw.agent) ? raw.agent : (base?.agent ?? (isAgentKind(id) ? id : null))
	if (!agent) return null
	const pick = <K extends keyof ReviewPreset>(key: K, parse: (value: unknown) => ReviewPreset[K], fallback: ReviewPreset[K]): ReviewPreset[K] =>
		key in raw ? parse(raw[key]) : fallback
	return {
		id,
		agent,
		skill: pick("skill", nonEmptyString, base?.skill ?? null),
		model: pick("model", nonEmptyString, base?.model ?? null),
		maxBudgetUsd: pick("maxBudgetUsd", positiveNumber, base?.maxBudgetUsd ?? null),
		extraPrompt: pick("extraPrompt", (value) => (typeof value === "string" ? value : ""), base?.extraPrompt ?? ""),
		command: pick("command", nonEmptyString, base?.command ?? null),
	}
}

const fallbackDefault = (presets: Readonly<Record<string, ReviewPreset>>): string =>
	presets[defaultReviewConfig.defaultPreset] ? defaultReviewConfig.defaultPreset : (Object.keys(presets).sort()[0] ?? defaultReviewConfig.defaultPreset)

/** True for the presets that exist without any config (`claude`, `codex`). */
export const isBuiltinPreset = (id: string): boolean => Object.hasOwn(defaultPresets, id)

/**
 * Parse the `review` block of config.json. User presets merge over the built-in
 * `claude` and `codex` presets; invalid values fall back to defaults.
 * `agentCommandOverride` (from `PRS_REVIEW_AGENT_BIN`) replaces every preset's binary.
 */
export const parseReviewConfig = (raw: unknown, agentCommandOverride: string | null = null): ReviewConfig => {
	const input = isRecord(raw) ? raw : {}
	const presets: Record<string, ReviewPreset> = { ...defaultPresets }
	if (isRecord(input.presets)) {
		for (const [id, value] of Object.entries(input.presets)) {
			// `null` removes a preset, built-ins included (the modal's delete).
			if (value === null) {
				delete presets[id]
				continue
			}
			const preset = parsePreset(id, value, defaultPresets[id])
			if (preset) presets[id] = preset
		}
	}
	// Deleting every preset would leave `b` with nothing to run.
	if (Object.keys(presets).length === 0) Object.assign(presets, defaultPresets)
	const override = nonEmptyString(agentCommandOverride)
	if (override) {
		for (const [id, preset] of Object.entries(presets)) presets[id] = { ...preset, command: override }
	}
	const requestedDefault = nonEmptyString(input.default)
	const concurrency = positiveNumber(input.concurrency)
	const timeoutMinutes = positiveNumber(input.timeoutMinutes)
	return {
		defaultPreset: requestedDefault && presets[requestedDefault] ? requestedDefault : fallbackDefault(presets),
		concurrency: concurrency ? Math.max(1, Math.floor(concurrency)) : DEFAULT_REVIEW_CONCURRENCY,
		timeoutMs: (timeoutMinutes ?? DEFAULT_REVIEW_TIMEOUT_MINUTES) * 60_000,
		presets,
	}
}

export const resolvePreset = (config: ReviewConfig, presetId?: string | null): ReviewPreset | null => config.presets[presetId ?? config.defaultPreset] ?? null
