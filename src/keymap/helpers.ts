import type { CommandConfig } from "@ghui/keymap"

const MAX_COUNT_PREFIX = 99

const countSequence = (count: number, key: string) => `${String(count).split("").join(" ")} ${key}`

/**
 * Vim-style "count prefix" navigation: `2 k` moves by 2, `15 j` by 15, etc.
 * Generates bindings for `count` × {k, up, j, down} for count ∈ [1, 99].
 *
 * Each generated binding is anonymous (no meta) — they don't belong in the
 * palette. Only `moveBy` semantics matter.
 */
export const countedVerticalBindings = <C>(moveBy: (ctx: C, delta: number) => void): readonly CommandConfig<C>[] => {
	const out: CommandConfig<C>[] = []
	for (let count = 1; count <= MAX_COUNT_PREFIX; count++) {
		out.push({ keys: [countSequence(count, "k"), countSequence(count, "up")], run: (s) => moveBy(s, -count) })
		out.push({ keys: [countSequence(count, "j"), countSequence(count, "down")], run: (s) => moveBy(s, count) })
	}
	return out
}

// Default vertical-nav key chords for selection modals. Vim + arrows + emacs
// (ctrl+p/n) + readline-ish ctrl+k/j. Modals that can't shadow `k`/`j` (the
// command palette accepts free text) pass an override.
export const defaultVerticalKeys = {
	up: ["k", "up", "ctrl+p", "ctrl+k"] as const,
	down: ["j", "down", "ctrl+n", "ctrl+j"] as const,
}

export interface ConfirmModalOptions<C> {
	readonly id: string
	readonly close: (ctx: C) => void
	readonly confirm: {
		readonly title: string
		readonly run: (ctx: C) => void
		readonly enabled?: (ctx: C) => true | string
	}
	readonly cancelTitle?: string
	readonly cancelKeys?: readonly string[]
}

export interface SelectionModalOptions<C> extends ConfirmModalOptions<C> {
	readonly move: (ctx: C, delta: -1 | 1) => void
	readonly verticalKeys?: { readonly up: readonly string[]; readonly down: readonly string[] }
}

/**
 * Two-button modal bindings: escape closes, return confirms. Used by
 * confirmation modals (close PR, delete comment, etc.).
 */
export const confirmModalBindings = <C>(options: ConfirmModalOptions<C>): readonly CommandConfig<C>[] => {
	const confirm: CommandConfig<C> = {
		id: `${options.id}.confirm`,
		title: options.confirm.title,
		keys: ["return"],
		run: options.confirm.run,
		...(options.confirm.enabled ? { enabled: options.confirm.enabled } : {}),
	}
	return [{ id: `${options.id}.cancel`, title: options.cancelTitle ?? "Cancel", keys: [...(options.cancelKeys ?? ["escape"])], run: options.close }, confirm]
}

/**
 * List-picker modal bindings: escape closes, return confirms the highlighted
 * entry, up/down move the highlight. Centralizes the default nav chords so
 * every selection modal stays in lock-step.
 */
export const selectionModalBindings = <C>(options: SelectionModalOptions<C>): readonly CommandConfig<C>[] => [
	...confirmModalBindings(options),
	{
		id: `${options.id}.up`,
		title: "Up",
		keys: [...(options.verticalKeys?.up ?? defaultVerticalKeys.up)],
		run: (ctx) => options.move(ctx, -1),
	},
	{
		id: `${options.id}.down`,
		title: "Down",
		keys: [...(options.verticalKeys?.down ?? defaultVerticalKeys.down)],
		run: (ctx) => options.move(ctx, 1),
	},
]
