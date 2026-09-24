import { describe, expect, test } from "bun:test"
import { parseReviewConfig } from "../src/review/config.ts"
import { buildReviewPrompt, READ_ONLY_RULES, type ReviewPromptInput } from "../src/review/prompt.ts"

const presets = parseReviewConfig(undefined).presets

const input: ReviewPromptInput = {
	repository: "owner/repo",
	number: 7,
	title: "Add retry",
	body: "Retries the fetch loop.",
	url: "https://github.com/owner/repo/pull/7",
	baseRefName: "main",
	headRefName: "feature/retry",
	headSha: "abcdef1234567890",
	mergeBase: "1234567",
	files: ["src/fetch.ts", "test/fetch.test.ts"],
	mode: "worktree",
}

describe("buildReviewPrompt", () => {
	test("includes PR context and file list", () => {
		const prompt = buildReviewPrompt(input, presets.claude!)
		for (const text of [
			"owner/repo#7",
			"Add retry",
			"Retries the fetch loop.",
			input.url,
			"Base branch: main",
			"abcdef1234567890",
			"- src/fetch.ts",
			".prs-context/diff.patch",
			".prs-context/log.txt",
			"(1234567..abcdef123456)",
		]) {
			expect(prompt).toContain(text)
		}
	})

	test("prefixes the claude prompt with the skill", () => {
		const prompt = buildReviewPrompt(input, presets.claude!)
		expect(prompt.startsWith("/review\n")).toBe(true)
		expect(prompt).toContain("`review` skill")
	})

	test("does not slash-prefix codex prompts", () => {
		const prompt = buildReviewPrompt(input, { ...presets.codex!, skill: "code-review" })
		expect(prompt.startsWith("/")).toBe(false)
		expect(prompt).toContain("`code-review` skill")
	})

	test("states the read-only rules and schema requirement", () => {
		const prompt = buildReviewPrompt(input, presets.codex!)
		for (const rule of READ_ONLY_RULES) expect(prompt).toContain(rule)
		expect(prompt).toMatch(/never post comments/i)
		expect(prompt).toMatch(/approv/i)
		expect(prompt).toMatch(/never push/i)
		expect(prompt).toMatch(/must be a single JSON object that matches the provided JSON schema/)
		expect(prompt).toContain("You have no shell")
		expect(prompt).not.toMatch(/git (diff|log|show|blame)/)
	})

	test("diff-only mode points at pr.diff", () => {
		const prompt = buildReviewPrompt({ ...input, mode: "diff-only", mergeBase: null }, presets.claude!)
		expect(prompt).toContain("diff-only mode")
		expect(prompt).toContain("pr.diff")
		expect(prompt).not.toContain(".prs-context")
	})

	test("appends extraPrompt", () => {
		expect(buildReviewPrompt(input, { ...presets.claude!, extraPrompt: "Focus on security." }).endsWith("Focus on security.")).toBe(true)
	})
})
