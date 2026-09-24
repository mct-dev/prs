import { describe, expect, test } from "bun:test"
import { buildClaudeInvocation, buildCodexInvocation, CLAUDE_ALLOWED_TOOLS, CLAUDE_DISALLOWED_TOOLS, parseClaudeResult, parseCodexOutput } from "../src/review/agents.ts"
import { parseReviewConfig } from "../src/review/config.ts"

const presets = parseReviewConfig(undefined).presets
const claude = presets.claude!
const codex = presets.codex!

const valueAfter = (args: readonly string[], flag: string) => args[args.indexOf(flag) + 1]

describe("buildClaudeInvocation", () => {
	const invocation = buildClaudeInvocation({ preset: claude, prompt: "/review\n\nhello", schemaJson: '{"type":"object"}', cwd: "/tmp/wt" })

	test("runs claude -p in the worktree with json output and schema", () => {
		expect(invocation.command).toBe("claude")
		expect(invocation.cwd).toBe("/tmp/wt")
		expect(invocation.args.slice(0, 2)).toEqual(["-p", "/review\n\nhello"])
		expect(valueAfter(invocation.args, "--output-format")).toBe("json")
		expect(valueAfter(invocation.args, "--json-schema")).toBe('{"type":"object"}')
		expect(valueAfter(invocation.args, "--max-budget-usd")).toBe("3")
		expect(invocation.args).not.toContain("--model")
	})

	test("is locked to read-only tools", () => {
		const args = invocation.args
		expect(valueAfter(args, "--permission-mode")).toBe("dontAsk")
		expect(valueAfter(args, "--setting-sources")).toBe("user")
		expect(args).toContain("--strict-mcp-config")
		const allowedStart = args.indexOf("--allowedTools") + 1
		expect(args.slice(allowedStart, allowedStart + CLAUDE_ALLOWED_TOOLS.length)).toEqual([...CLAUDE_ALLOWED_TOOLS])
		expect(args[allowedStart + CLAUDE_ALLOWED_TOOLS.length]).toBe("--disallowedTools")
		const deniedStart = args.indexOf("--disallowedTools") + 1
		expect(args.slice(deniedStart, deniedStart + CLAUDE_DISALLOWED_TOOLS.length)).toEqual([...CLAUDE_DISALLOWED_TOOLS])
		// Variadic lists must be terminated by a flag, never by a positional.
		expect(args[deniedStart + CLAUDE_DISALLOWED_TOOLS.length]?.startsWith("--")).toBe(true)
		for (const tool of ["Edit", "Write", "Bash(gh:*)", "Bash(git push:*)"]) expect(CLAUDE_DISALLOWED_TOOLS).toContain(tool as never)
		expect(CLAUDE_ALLOWED_TOOLS.some((tool) => tool === "Bash" || tool.startsWith("Edit") || tool.startsWith("Write"))).toBe(false)
	})

	test("passes model and binary override", () => {
		const next = buildClaudeInvocation({ preset: { ...claude, model: "opus", command: "/bin/fake", maxBudgetUsd: null }, prompt: "p", schemaJson: "{}", cwd: "/w" })
		expect(next.command).toBe("/bin/fake")
		expect(valueAfter(next.args, "--model")).toBe("opus")
		expect(next.args).not.toContain("--max-budget-usd")
	})
})

describe("buildCodexInvocation", () => {
	test("uses a read-only sandbox, output schema, and last-message file", () => {
		const invocation = buildCodexInvocation({ preset: { ...codex, model: "gpt-x" }, prompt: "review it", schemaPath: "/s.json", outputPath: "/o.json", cwd: "/wt" })
		expect(invocation.command).toBe("codex")
		expect(invocation.args[0]).toBe("exec")
		expect(valueAfter(invocation.args, "-s")).toBe("read-only")
		expect(valueAfter(invocation.args, "--output-schema")).toBe("/s.json")
		expect(valueAfter(invocation.args, "-o")).toBe("/o.json")
		expect(valueAfter(invocation.args, "-C")).toBe("/wt")
		expect(valueAfter(invocation.args, "-m")).toBe("gpt-x")
		expect(invocation.args).toContain("--skip-git-repo-check")
		expect(invocation.args.slice(-2)).toEqual(["--", "review it"])
	})
})

describe("parseClaudeResult", () => {
	test("extracts structured_output and cost", () => {
		const stdout = JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0.42, structured_output: { risk: "low" } })
		expect(parseClaudeResult(stdout, 0)).toEqual({ _tag: "Output", output: { risk: "low" }, costUsd: 0.42, notes: [] })
	})

	test("reports errors with subtype and cost, even on non-zero exit", () => {
		const stdout = JSON.stringify({
			type: "result",
			subtype: "error_max_budget_usd",
			is_error: true,
			total_cost_usd: 1.01,
			permission_denials: [{ tool_name: "Bash", tool_input: { command: "gh pr comment 1" } }],
		})
		const outcome = parseClaudeResult(stdout, 1)
		expect(outcome._tag).toBe("Failed")
		expect(outcome.costUsd).toBe(1.01)
		if (outcome._tag === "Failed") expect(outcome.message).toContain("error_max_budget_usd")
		expect(outcome.notes).toEqual(["permission denied: Bash gh pr comment 1"])
	})

	test("fails when structured_output is missing or stdout is not JSON", () => {
		expect(parseClaudeResult(JSON.stringify({ subtype: "success", is_error: false, result: "hi" }), 0)._tag).toBe("Failed")
		const outcome = parseClaudeResult("boom", 2, "auth error")
		expect(outcome._tag).toBe("Failed")
		if (outcome._tag === "Failed") expect(outcome.message).toContain("auth error")
	})

	test("tolerates log lines before the JSON result", () => {
		const stdout = `warning: something\n${JSON.stringify({ is_error: false, structured_output: { ok: true } })}\n`
		expect(parseClaudeResult(stdout, 0)._tag).toBe("Output")
	})
})

describe("parseCodexOutput", () => {
	test("parses the last-message JSON", () => {
		expect(parseCodexOutput('{"risk":"high"}', 0)).toEqual({ _tag: "Output", output: { risk: "high" }, costUsd: null, notes: [] })
	})

	test("fails on empty or invalid output", () => {
		expect(parseCodexOutput(null, 1, "sandbox error")._tag).toBe("Failed")
		expect(parseCodexOutput("not json", 0)._tag).toBe("Failed")
	})
})
