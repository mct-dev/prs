import { describe, expect, test } from "bun:test"
import { parseReviewConfig } from "../src/review/config.ts"
import { reviewPresetOptions } from "../src/ui/modals/ReviewPresetModal.tsx"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// Shared probe prelude: a fake AgentRunner that records startReview calls (it
// never spawns an agent) and a registry seeded with one selected PR.
const prelude = `
	import { Effect } from "effect"
	import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
	import { dispatchCommand } from "./src/commands/dispatch.ts"
	import { parseReviewConfig } from "./src/review/config.ts"
	import { reviewEntryFromRecord, reviewKey } from "./src/review/briefStatus.ts"
	import { AgentRunner } from "./src/services/AgentRunner.ts"
	import { activeModalAtom } from "./src/ui/modals/atoms.ts"
	import { noticeAtom } from "./src/ui/notice/atoms.ts"
	import { selectedPullRequestAtom } from "./src/ui/pullRequests/atoms.ts"
	import { agentReviewIndexAtom } from "./src/ui/review/atoms.ts"
	import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
	const pr = { repository: "owner/repo", number: 42, title: "Tidy", headRefOid: "head-1", url: "https://example.test/pr/42" }
	const calls = []
	const config = parseReviewConfig({ default: "codex", presets: { deep: { agent: "claude", model: "opus", maxBudgetUsd: 5 } } })
	const runner = {
		config: Effect.succeed(config),
		startReview: (pullRequest, presetId) => Effect.sync(() => { calls.push({ number: pullRequest.number, presetId: presetId ?? null }); return "run-1" }),
	}
	const runningIndex = {
		[reviewKey(pr.repository, pr.number)]: reviewEntryFromRecord({
			id: "run-0", repository: pr.repository, number: pr.number, headSha: pr.headRefOid, preset: "claude", agent: "claude",
			status: "running", mode: null, briefJson: null, error: null, logPath: null, costUsd: null, startedAt: new Date(0), finishedAt: null,
		}),
	}
	const run = (registry, id) => Effect.runPromise(dispatchCommand(id).pipe(
		Effect.provideService(AtomRegistry.AtomRegistry, registry),
		Effect.provideService(AgentRunner, runner),
	))
`

describe("agent review commands", () => {
	test("b is gated on a selected PR and never starts a duplicate run", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			const noPr = AtomRegistry.make({ initialValues: [[workspaceSurfaceAtom, "pullRequests"], [selectedPullRequestAtom, null]] })
			await run(noPr, "pull.agent-review")
			const afterNoPr = calls.length
			const running = AtomRegistry.make({ initialValues: [[workspaceSurfaceAtom, "pullRequests"], [selectedPullRequestAtom, pr], [agentReviewIndexAtom, runningIndex]] })
			await run(running, "pull.agent-review")
			const runningNotice = running.get(noticeAtom)
			const afterRunning = calls.length
			const idle = AtomRegistry.make({ initialValues: [[workspaceSurfaceAtom, "pullRequests"], [selectedPullRequestAtom, pr], [agentReviewIndexAtom, {}]] })
			await run(idle, "pull.agent-review")
			console.log(JSON.stringify({ afterNoPr, afterRunning, runningNotice, calls, idleNotice: idle.get(noticeAtom) }))
		`)
		expect(JSON.parse(stdout)).toEqual({
			afterNoPr: 0,
			afterRunning: 0,
			runningNotice: "Agent review already running for #42",
			calls: [{ number: 42, presetId: null }],
			idleNotice: "Agent review started for #42",
		})
	})

	test("B opens the picker with presets from config and runs the chosen one", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			const registry = AtomRegistry.make({ initialValues: [[workspaceSurfaceAtom, "pullRequests"], [selectedPullRequestAtom, pr], [agentReviewIndexAtom, {}]] })
			await run(registry, "pull.agent-review-preset")
			const opened = registry.get(activeModalAtom)
			registry.set(activeModalAtom, { ...opened, selectedIndex: 2 })
			await run(registry, "pull.agent-review-preset-run")
			const blocked = AtomRegistry.make({ initialValues: [[workspaceSurfaceAtom, "pullRequests"], [selectedPullRequestAtom, pr], [agentReviewIndexAtom, runningIndex]] })
			await run(blocked, "pull.agent-review-preset")
			await run(blocked, "pull.agent-review-preset-run")
			console.log(JSON.stringify({
				tag: opened._tag,
				ids: opened.presets.map((preset) => preset.id),
				selectedIndex: opened.selectedIndex,
				closed: registry.get(activeModalAtom)._tag,
				calls,
				notice: registry.get(noticeAtom),
				blockedNotice: blocked.get(noticeAtom),
			}))
		`)
		expect(JSON.parse(stdout)).toEqual({
			tag: "ReviewPreset",
			ids: ["codex", "claude", "deep"],
			selectedIndex: 0,
			closed: "None",
			calls: [{ number: 42, presetId: "deep" }],
			notice: "Agent review (deep) started for #42",
			blockedNotice: "Agent review already running for #42",
		})
	})

	test("preset options summarize each configured preset, default first", () => {
		const options = reviewPresetOptions(parseReviewConfig({ presets: { deep: { agent: "claude", model: "opus", maxBudgetUsd: 5, extraPrompt: "Focus on auth." } } }))
		expect(options.map(({ preset: _preset, ...rest }) => rest)).toEqual([
			{ id: "claude", detail: "claude · skill review · ≤ $3", isDefault: true },
			{ id: "codex", detail: "codex", isDefault: false },
			{ id: "deep", detail: "claude · model opus · ≤ $5 · +prompt", isDefault: false },
		])
		expect(options[2]?.preset).toMatchObject({ agent: "claude", model: "opus", maxBudgetUsd: 5 })
	})
})
