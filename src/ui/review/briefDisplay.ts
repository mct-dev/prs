import type { RiskLevel } from "../../review/briefSchema.js"
import type { BriefStatus } from "../../review/briefStatus.js"
import { colors } from "../colors.js"
import { SPINNER_FRAMES } from "../spinner.js"

/** Theme color for a brief's risk level. */
export const riskColor = (risk: RiskLevel) => (risk === "high" ? colors.status.failing : risk === "medium" ? colors.status.pending : colors.status.passing)

export interface BriefGlyph {
	readonly text: string
	readonly fg: string
}

/**
 * One-cell list marker for a PR's agent review: the first spinner frame while
 * it runs (the list animates it with `BriefSpinner`), `!` on error, a dim ring for a brief made for an older head, a risk
 * colored dot for a current brief, and nothing when there is no brief.
 */
export const briefGlyph = (status: BriefStatus): BriefGlyph => {
	switch (status._tag) {
		case "running":
			return { text: SPINNER_FRAMES[0], fg: colors.status.pending }
		case "error":
			return { text: "!", fg: colors.status.failing }
		case "done":
			return status.stale ? { text: "○", fg: colors.muted } : { text: "●", fg: riskColor(status.brief.risk) }
		case "idle":
			return { text: " ", fg: colors.muted }
	}
}
