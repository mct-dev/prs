import type { PullRequestItem } from "../domain.js"
import { expandToken } from "./compile.js"
import type { SectionConfig, SectionVarValue } from "./config.js"

// Plain-language "why is this PR here?" for a section, built from its query:
//
//   team-authors:{my_teams} -author:{me}  →  authors in my-org/backend (12 people) · not me
//
// Per PR, a team branch names the author: "@alice in my-org/backend (12 people) · not me".
// Unknown qualifiers are shown as written.

export interface ReasonTeam {
	/** `org/team` as written in the query. */
	readonly slug: string
	/** Lowercased member logins the query was compiled from; null when the team could not be loaded. */
	readonly members: readonly string[] | null
}

export interface ReasonBranch {
	/** Phrases for this branch's non-team tokens. */
	readonly parts: readonly string[]
	/** Positive `team-authors:` teams in this branch. */
	readonly teams: readonly ReasonTeam[]
}

export interface SectionReason {
	/** One line for the whole section. */
	readonly summary: string
	/** One per `any:` branch (or the single `query:`). */
	readonly branches: readonly ReasonBranch[]
	/** Phrases shared by every branch: `exclude:` and `where:`. */
	readonly shared: readonly string[]
}

export interface ReasonContext {
	readonly vars: Readonly<Record<string, SectionVarValue>>
	/** Members per lowercased `org/team`. */
	readonly teamMembers: ReadonlyMap<string, readonly string[]>
}

const SEPARATOR = " · "
const qualifierPattern = /^(-?)([a-z][a-z-]*):(.+)$/i
const silentQualifiers = new Set(["is", "archived", "sort"])

const meQualifiers: Record<string, readonly [string, string]> = {
	"review-requested": ["review requested from you", "no review requested from you"],
	"reviewed-by": ["you reviewed", "you haven't reviewed"],
	author: ["your PRs", "not me"],
	assignee: ["assigned to you", "not assigned to you"],
	mentions: ["mentions you", "doesn't mention you"],
	involves: ["involves you", "doesn't involve you"],
	commenter: ["you commented", "you haven't commented"],
}

const knownWheres: Record<string, string> = {
	"me.reviewed and not me.reviewed_since_push": "new commits since your review",
}

const people = (count: number) => (count === 1 ? "1 person" : `${count} people`)

const teamPhrase = (team: ReasonTeam) => (team.members === null ? `authors in ${team.slug}` : `authors in ${team.slug} (${people(team.members.length)})`)

const teamList = (value: string, context: ReasonContext): readonly string[] => {
	try {
		return expandToken(value, context.vars)
	} catch {
		return [value]
	}
}

const describeToken = (token: string, context: ReasonContext, branch: { parts: string[]; teams: ReasonTeam[] }) => {
	const match = qualifierPattern.exec(token)
	if (!match) {
		branch.parts.push(token)
		return
	}
	const [, sign, rawName, value] = match
	const name = rawName!.toLowerCase()
	const negated = sign === "-"
	if (silentQualifiers.has(name)) return
	if (name === "team-authors") {
		for (const slug of teamList(value!, context)) {
			const team = { slug, members: context.teamMembers.get(slug.toLowerCase())?.map((login) => login.toLowerCase()) ?? null }
			if (negated) branch.parts.push(`not ${teamPhrase(team).replace(/^authors /, "")}`)
			else branch.teams.push(team)
		}
		return
	}
	if (value === "{me}" && meQualifiers[name]) {
		branch.parts.push(meQualifiers[name]![negated ? 1 : 0])
		return
	}
	if (name === "draft" && (value === "true" || value === "false")) {
		branch.parts.push((value === "true") !== negated ? "drafts" : "ready")
		return
	}
	const listVar = /^\{([a-z_][a-z0-9_]*)\}$/i.exec(value!)
	if (name === "author" && listVar) {
		branch.parts.push(negated ? `not ${listVar[1]}` : listVar[1]!)
		return
	}
	branch.parts.push(token)
}

const describeTokens = (query: string, context: ReasonContext) => {
	const branch = { parts: [] as string[], teams: [] as ReasonTeam[] }
	for (const token of query.split(/\s+/).filter((part) => part.length > 0)) describeToken(token, context, branch)
	return branch
}

const negate = (token: string) => (token.startsWith("-") ? token.slice(1) : `-${token}`)

const branchPhrases = (branch: ReasonBranch) => [...branch.teams.map(teamPhrase), ...branch.parts]

/** Describe one configured section. `me` need not be in `vars`. */
export const describeSection = (section: SectionConfig, context: ReasonContext): SectionReason => {
	const queries = section.any && section.any.length > 0 ? section.any.map((branch) => (section.query ? `${section.query} ${branch}` : branch)) : [section.query ?? ""]
	const branches: ReasonBranch[] = queries.map((query) => describeTokens(query, context))
	const shared: string[] = []
	if (section.exclude) {
		const excluded = section.exclude
			.split(/\s+/)
			.filter((token) => token.length > 0)
			.map(negate)
			.join(" ")
		shared.push(...describeTokens(excluded, context).parts)
	}
	const where = section.where?.trim()
	if (where) shared.push(knownWheres[where.replace(/\s+/g, " ").toLowerCase()] ?? `where ${where}`)
	const described = branches.map((branch) => branchPhrases(branch).join(SEPARATOR)).filter((text) => text.length > 0)
	const summary = [described.length > 1 ? described.map((text) => `(${text})`).join(" or ") : (described[0] ?? ""), ...shared].filter((text) => text.length > 0).join(SEPARATOR)
	return { summary, branches, shared }
}

/**
 * Why this PR is in the section. When the author is on one of the section's
 * teams, names them; otherwise the single matching branch or the summary.
 */
export const sectionReasonFor = (pullRequest: Pick<PullRequestItem, "author">, reason: SectionReason): string => {
	const author = pullRequest.author.toLowerCase()
	for (const branch of reason.branches) {
		const team = branch.teams.find((candidate) => candidate.members?.includes(author))
		if (!team) continue
		return [`@${pullRequest.author} in ${team.slug} (${people(team.members!.length)})`, ...branch.parts, ...reason.shared].join(SEPARATOR)
	}
	const plain = reason.branches.filter((branch) => branch.teams.length === 0)
	const teamsKnown = reason.branches.every((branch) => branch.teams.every((team) => team.members !== null))
	if (reason.branches.length > 1 && plain.length === 1 && teamsKnown) return [...plain[0]!.parts, ...reason.shared].join(SEPARATOR)
	return reason.summary
}
