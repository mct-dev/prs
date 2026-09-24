/** One of the viewer's GitHub teams. `members` is null when GitHub did not report a count. */
export interface ViewerTeam {
	/** `org/slug` */
	readonly slug: string
	readonly name: string
	readonly members: number | null
}

/**
 * The teams `{my_teams}` means when `sections.yaml` leaves it unset.
 *
 * Big umbrella teams (`everyone`, `engineering`) swamp "My team's work", so
 * with more than one team we pick the smallest one(s), ties included. With
 * zero or one team, or when any count is unknown, every team is used.
 */
export const defaultMyTeams = (teams: readonly ViewerTeam[]): readonly string[] => {
	if (teams.length <= 1 || teams.some((team) => team.members === null)) return teams.map((team) => team.slug)
	const smallest = Math.min(...teams.map((team) => team.members!))
	return teams.filter((team) => team.members === smallest).map((team) => team.slug)
}
