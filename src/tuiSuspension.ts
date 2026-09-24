/**
 * Bridges the foreground TUI renderer (owned by `index.tsx`) and code that
 * needs to hand the terminal to an interactive subprocess (e.g. opening a PR in
 * `nvim`). `index.tsx` registers a suspender backed by `renderer.suspend()` /
 * `renderer.resume()`; consumers call `withTuiSuspended` and never import the
 * renderer directly.
 *
 * When no suspender is registered (tests, mock mode, headless), the action
 * simply runs without suspension.
 */

export interface TuiSuspender {
	readonly suspend: () => void
	readonly resume: () => void
}

let activeSuspender: TuiSuspender | null = null

export const setTuiSuspender = (suspender: TuiSuspender | null): void => {
	activeSuspender = suspender
}

/**
 * Suspend the TUI (if registered), await `run()`, then resume — even if `run`
 * throws. The renderer is always resumed so a failed editor launch can never
 * leave the terminal in a broken state.
 */
export const withTuiSuspended = async <A>(run: () => Promise<A>): Promise<A> => {
	const suspender = activeSuspender
	if (!suspender) return run()
	suspender.suspend()
	try {
		return await run()
	} finally {
		suspender.resume()
	}
}
