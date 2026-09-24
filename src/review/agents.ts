import type { ReviewPreset } from "./config.js"

export interface AgentInvocation {
	readonly command: string
	readonly args: readonly string[]
	readonly cwd: string
}

/** Tools the Claude reviewer may use. Everything else is denied in `dontAsk` mode. */
export const CLAUDE_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git blame:*)"] as const

/** Belt and braces: explicitly deny tools that could write, post, or reach the network. */
export const CLAUDE_DISALLOWED_TOOLS = ["Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Bash(gh:*)", "Bash(git push:*)", "Bash(git commit:*)", "Bash(curl:*)"] as const

export interface ClaudeArgsInput {
	readonly preset: ReviewPreset
	readonly prompt: string
	readonly schemaJson: string
	readonly cwd: string
}

/**
 * `--allowedTools`/`--disallowedTools` are variadic, so each tool is its own argv
 * element, the prompt sits directly after `-p`, and a non-variadic flag always
 * follows the tool lists.
 */
export const buildClaudeInvocation = ({ preset, prompt, schemaJson, cwd }: ClaudeArgsInput): AgentInvocation => ({
	command: preset.command ?? "claude",
	cwd,
	args: [
		"-p",
		prompt,
		"--permission-mode",
		"dontAsk",
		"--allowedTools",
		...CLAUDE_ALLOWED_TOOLS,
		"--disallowedTools",
		...CLAUDE_DISALLOWED_TOOLS,
		"--output-format",
		"json",
		"--json-schema",
		schemaJson,
		// Ignore project/local settings from the (untrusted) PR checkout; keep user skills.
		"--setting-sources",
		"user",
		"--strict-mcp-config",
		...(preset.maxBudgetUsd !== null ? ["--max-budget-usd", String(preset.maxBudgetUsd)] : []),
		...(preset.model ? ["--model", preset.model] : []),
	],
})

export interface CodexArgsInput {
	readonly preset: ReviewPreset
	readonly prompt: string
	readonly schemaPath: string
	readonly outputPath: string
	readonly cwd: string
}

export const buildCodexInvocation = ({ preset, prompt, schemaPath, outputPath, cwd }: CodexArgsInput): AgentInvocation => ({
	command: preset.command ?? "codex",
	cwd,
	args: [
		"exec",
		"-s",
		"read-only",
		"--skip-git-repo-check",
		"--ephemeral",
		"--output-schema",
		schemaPath,
		"-o",
		outputPath,
		"-C",
		cwd,
		...(preset.model ? ["-m", preset.model] : []),
		"--",
		prompt,
	],
})

export type AgentOutcome =
	| { readonly _tag: "Output"; readonly output: unknown; readonly costUsd: number | null; readonly notes: readonly string[] }
	| { readonly _tag: "Failed"; readonly message: string; readonly costUsd: number | null; readonly notes: readonly string[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const lastJsonObject = (text: string): unknown => {
	const trimmed = text.trim()
	if (trimmed.length === 0) return undefined
	try {
		return JSON.parse(trimmed)
	} catch {
		// Some CLIs print warnings before the JSON result; take the last line that parses.
		const lines = trimmed.split("\n").reverse()
		for (const line of lines) {
			try {
				return JSON.parse(line)
			} catch {
				// keep looking
			}
		}
		return undefined
	}
}

const describeDenials = (value: unknown): readonly string[] => {
	if (!Array.isArray(value)) return []
	return value.map((denial) => {
		if (!isRecord(denial)) return "permission denied"
		const tool = typeof denial.tool_name === "string" ? denial.tool_name : "tool"
		const input = isRecord(denial.tool_input) && typeof denial.tool_input.command === "string" ? ` ${denial.tool_input.command}` : ""
		return `permission denied: ${tool}${input}`
	})
}

/** Parse `claude -p --output-format json` stdout. Parsed even on non-zero exit. */
export const parseClaudeResult = (stdout: string, exitCode: number, stderr = ""): AgentOutcome => {
	const value = lastJsonObject(stdout)
	if (!isRecord(value)) {
		const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`
		return { _tag: "Failed", message: `claude produced no JSON result: ${detail.slice(0, 500)}`, costUsd: null, notes: [] }
	}
	const costUsd = typeof value.total_cost_usd === "number" ? value.total_cost_usd : null
	const notes = describeDenials(value.permission_denials)
	const subtype = typeof value.subtype === "string" ? value.subtype : "unknown"
	if (value.is_error === true) {
		const result = typeof value.result === "string" && value.result.trim().length > 0 ? `: ${value.result.trim().slice(0, 300)}` : ""
		return { _tag: "Failed", message: `claude run failed (${subtype})${result}`, costUsd, notes }
	}
	if (value.structured_output === undefined || value.structured_output === null) {
		return { _tag: "Failed", message: `claude returned no structured_output (${subtype})`, costUsd, notes }
	}
	return { _tag: "Output", output: value.structured_output, costUsd, notes }
}

/** Parse the `-o` last-message file written by `codex exec --output-schema`. */
export const parseCodexOutput = (text: string | null, exitCode: number, stderr = ""): AgentOutcome => {
	if (text === null || text.trim().length === 0) {
		const detail = stderr.trim().split("\n").slice(-5).join("\n") || `exit code ${exitCode}`
		return { _tag: "Failed", message: `codex produced no output: ${detail.slice(0, 500)}`, costUsd: null, notes: [] }
	}
	const value = lastJsonObject(text)
	if (value === undefined) return { _tag: "Failed", message: "codex output is not valid JSON", costUsd: null, notes: [] }
	return { _tag: "Output", output: value, costUsd: null, notes: [] }
}
