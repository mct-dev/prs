import type { ReviewPreset } from "./config.js"

export type ReviewMode = "worktree" | "diff-only"

export interface ReviewPromptInput {
	readonly repository: string
	readonly number: number
	readonly title: string
	readonly body: string
	readonly url: string
	readonly baseRefName: string
	readonly headRefName: string
	readonly headSha: string
	/** Merge base of the PR head with its base branch, when known (worktree mode). */
	readonly mergeBase: string | null
	readonly files: readonly string[]
	readonly mode: ReviewMode
}

const MAX_FILES = 200
const MAX_BODY_CHARS = 8_000

export const READ_ONLY_RULES = [
	"This is a strictly read-only review.",
	"Never post comments, reviews, or approvals. Never push, commit, merge, or create branches.",
	"Never create, modify, or delete files. Do not run commands that change the repository or anything on GitHub.",
	"Use only read-only inspection (reading files, searching, git diff/log/show/blame).",
] as const

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text)

const fileList = (files: readonly string[]) => {
	if (files.length === 0) return "(file list unavailable)"
	const shown = files.slice(0, MAX_FILES).map((file) => `- ${file}`)
	return files.length > MAX_FILES ? [...shown, `- …and ${files.length - MAX_FILES} more`].join("\n") : shown.join("\n")
}

const locationSection = (input: ReviewPromptInput) => {
	if (input.mode === "worktree") {
		const range = input.mergeBase ? `${input.mergeBase}..HEAD` : `origin/${input.baseRefName}...HEAD`
		return ["The PR head is checked out (detached) in the current directory.", `See the full change with \`git diff ${range}\`; inspect history with git log/show/blame.`].join(
			"\n",
		)
	}
	return [
		"You are in diff-only mode: there is no checkout of the repository.",
		"The current directory contains `pr.diff` (the unified diff of the PR) and `pr.json` (PR metadata). Base the review on those files only.",
	].join("\n")
}

const skillLine = (preset: ReviewPreset) => {
	if (!preset.skill) return "Review the PR carefully."
	return `Review it with the \`${preset.skill}\` skill.`
}

export const buildReviewPrompt = (input: ReviewPromptInput, preset: ReviewPreset): string => {
	const sections = [
		`You are reviewing pull request ${input.repository}#${input.number} to produce a risk brief for a human reviewer.`,
		[`Title: ${input.title}`, `URL: ${input.url}`, `Base branch: ${input.baseRefName}`, `Head branch: ${input.headRefName}`, `Head SHA: ${input.headSha}`].join("\n"),
		`Description:\n${input.body.trim().length > 0 ? truncate(input.body.trim(), MAX_BODY_CHARS) : "(no description)"}`,
		`Changed files:\n${fileList(input.files)}`,
		locationSection(input),
		skillLine(preset),
		`Rules:\n${READ_ONLY_RULES.map((rule) => `- ${rule}`).join("\n")}`,
		[
			"Your final answer must be a single JSON object that matches the provided JSON schema exactly (risk, summary, before_after, focus_areas, safe_to_skip, questions, tests, confidence).",
			"Put the most important focus areas first. Use null for before_after, tests, or lines when not applicable.",
		].join("\n"),
		...(preset.extraPrompt.trim().length > 0 ? [preset.extraPrompt.trim()] : []),
	]
	const prompt = sections.join("\n\n")
	// Claude resolves `/<skill>` at the start of the prompt as a skill or slash command.
	return preset.agent === "claude" && preset.skill ? `/${preset.skill}\n\n${prompt}` : prompt
}
