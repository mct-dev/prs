import type { ViewerTeam } from "../../sections/teams.js"
import type { TeamsModalState } from "./types.js"

// Pure state edits for the "Choose my teams" modal (kept free of app imports so tests can load them cheaply).

/** Viewer teams smallest first, plus any configured slug the viewer isn't on (so it can be unchecked). */
export const teamsModalRows = (teams: readonly ViewerTeam[], chosen: readonly string[]): readonly ViewerTeam[] => {
	const sorted = [...teams].sort((left, right) => (left.members ?? Infinity) - (right.members ?? Infinity) || left.slug.localeCompare(right.slug))
	const known = new Set(sorted.map((team) => team.slug.toLowerCase()))
	const extra = chosen.filter((slug) => !known.has(slug.toLowerCase())).map((slug): ViewerTeam => ({ slug, name: slug, members: null }))
	return [...sorted, ...extra]
}

/** Keymap-side edits to the open Teams modal. */
export const moveTeamsSelection = (state: TeamsModalState, delta: -1 | 1): TeamsModalState =>
	state.teams.length === 0 ? state : { ...state, selectedIndex: (state.selectedIndex + delta + state.teams.length) % state.teams.length }

export const toggleTeamsSelection = (state: TeamsModalState): TeamsModalState => {
	const team = state.teams[state.selectedIndex]
	if (!team || state.loading) return state
	const chosen = state.chosen.includes(team.slug) ? state.chosen.filter((slug) => slug !== team.slug) : [...state.chosen, team.slug]
	// Keep the list's order so the saved line reads the same as the modal.
	const order = new Map(state.teams.map((row, index) => [row.slug, index]))
	return { ...state, error: null, chosen: [...chosen].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)) }
}
