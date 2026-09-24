import { describe, expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

// Probe prelude: a selected PR with a finished review, a fake EditorOpener that
// records pageFile calls, and a dispatcher. No agent is ever spawned.
const prelude = `
	import { Effect } from "effect"
	import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
	import { registerHandoff } from "./src/commands/handoffs.ts"
	import { dispatchCommand } from "./src/commands/dispatch.ts"
	import { reviewEntryFromRecord, reviewKey } from "./src/review/briefStatus.ts"
	import { CommandError } from "./src/services/CommandRunner.ts"
	import { EditorOpener } from "./src/services/EditorOpener.ts"
	import { detailFullViewAtom } from "./src/ui/detail/atoms.ts"
	import { diffFullViewAtom } from "./src/ui/diff/atoms.ts"
	import { noticeAtom } from "./src/ui/notice/atoms.ts"
	import { selectedPullRequestAtom } from "./src/ui/pullRequests/atoms.ts"
	import { agentReviewIndexAtom } from "./src/ui/review/atoms.ts"
	import { briefFocusIndexAtom, briefFullViewAtom, pendingBriefDiffTargetAtom } from "./src/ui/review/briefViewAtoms.ts"
	import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
	const pr = { repository: "owner/repo", number: 42, title: "Tidy", headRefOid: "head-1", url: "https://example.test/pr/42" }
	const brief = {
		risk: "medium", summary: "s", confidence: "high", questions: [], safe_to_skip: [],
		focus_areas: [
			{ file: "src/a.ts", lines: "10-12", why: "a", severity: "low" },
			{ file: "src/b.ts", why: "b", severity: "high" },
		],
	}
	const index = (logPath) => ({
		[reviewKey(pr.repository, pr.number)]: reviewEntryFromRecord({
			id: "run-1", repository: pr.repository, number: pr.number, headSha: pr.headRefOid, preset: "claude", agent: "claude",
			status: "done", mode: "diff-only", briefJson: JSON.stringify(brief), error: null, logPath, costUsd: 0.1,
			startedAt: new Date(0), finishedAt: new Date(1000),
		}),
	})
	const paged = []
	const opener = (fails) => ({
		openPullRequest: () => Effect.void,
		pageFile: (path) => fails
			? Effect.fail(new CommandError({ command: "less", args: [path], detail: "no pager", cause: null }))
			: Effect.sync(() => { paged.push(path) }),
	})
	const registryWith = (values) => AtomRegistry.make({ initialValues: [[workspaceSurfaceAtom, "pullRequests"], ...values] })
	const run = (registry, id, fails = false) => Effect.runPromise(dispatchCommand(id).pipe(
		Effect.provideService(AtomRegistry.AtomRegistry, registry),
		Effect.provideService(EditorOpener, opener(fails)),
	))
`

describe("brief view commands", () => {
	test("v is gated on a PR; opening clears the diff and esc returns to detail", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			const noPr = registryWith([[selectedPullRequestAtom, null]])
			await run(noPr, "brief.open")
			const fromDetail = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index(null)], [detailFullViewAtom, true], [diffFullViewAtom, true]])
			await run(fromDetail, "brief.open")
			const opened = { brief: fromDetail.get(briefFullViewAtom), diff: fromDetail.get(diffFullViewAtom), detail: fromDetail.get(detailFullViewAtom) }
			await run(fromDetail, "brief.close")
			console.log(JSON.stringify({
				noPr: noPr.get(briefFullViewAtom),
				opened,
				closed: { brief: fromDetail.get(briefFullViewAtom), detail: fromDetail.get(detailFullViewAtom) },
			}))
		`)
		expect(JSON.parse(stdout)).toEqual({
			noPr: false,
			opened: { brief: true, diff: false, detail: false },
			closed: { brief: false, detail: true },
		})
	})

	test("enter on a focus area parks the diff target and hands off to the diff view", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			let handoffs = 0
			registerHandoff("openDiffView", () => { handoffs++ })
			const registry = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index(null)]])
			await run(registry, "brief.open")
			registry.set(briefFocusIndexAtom, 1)
			await run(registry, "brief.open-focus")
			console.log(JSON.stringify({ target: registry.get(pendingBriefDiffTargetAtom), brief: registry.get(briefFullViewAtom), handoffs }))
		`)
		expect(JSON.parse(stdout)).toEqual({ target: { url: "https://example.test/pr/42", file: "src/b.ts", lines: null }, brief: false, handoffs: 1 })
	})

	test("o pages the log, or falls back to showing its path", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			const noLog = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index(null)]])
			await run(noLog, "brief.open-log")
			const withLog = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index("/tmp/run-1.log")]])
			await run(withLog, "brief.open-log")
			const failing = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index("/tmp/run-1.log")]])
			await run(failing, "brief.open-log", true)
			console.log(JSON.stringify({ noLog: noLog.get(noticeAtom), paged, failing: failing.get(noticeAtom) }))
		`)
		expect(JSON.parse(stdout)).toEqual({
			noLog: "No agent review log for this pull request.",
			paged: ["/tmp/run-1.log"],
			failing: "Agent log: /tmp/run-1.log",
		})
	})
})
