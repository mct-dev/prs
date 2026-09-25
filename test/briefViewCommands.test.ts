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
	import { briefFocusIndexAtom, briefFullViewAtom, briefScrollTopAtom, pendingBriefDiffTargetAtom } from "./src/ui/review/briefViewAtoms.ts"
	import { runsFullViewAtom } from "./src/ui/runs/atoms.ts"
	import { diffReturnViewAtom } from "./src/ui/viewReturn.ts"
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
		expect(JSON.parse(stdout)).toEqual({ target: { url: "https://example.test/pr/42", headSha: "head-1", file: "src/b.ts", lines: null }, brief: false, handoffs: 1 })
	})

	test("a plain diff open or a diff close drops a parked target", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			let handoffs = 0
			registerHandoff("openDiffView", () => { handoffs++ })
			const target = { url: pr.url, headSha: pr.headRefOid, file: "src/a.ts", lines: "10" }
			const opened = registryWith([[selectedPullRequestAtom, pr], [pendingBriefDiffTargetAtom, target]])
			await run(opened, "diff.open")
			const closed = registryWith([[selectedPullRequestAtom, pr], [pendingBriefDiffTargetAtom, target], [diffFullViewAtom, true]])
			await run(closed, "diff.close")
			console.log(JSON.stringify({ opened: opened.get(pendingBriefDiffTargetAtom), closed: closed.get(pendingBriefDiffTargetAtom), handoffs }))
		`)
		expect(JSON.parse(stdout)).toEqual({ opened: null, closed: null, handoffs: 1 })
	})

	test("esc from a diff opened on a focus area returns to the brief, then to detail", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			registerHandoff("openDiffView", () => {})
			const registry = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index(null)], [detailFullViewAtom, true]])
			await run(registry, "brief.open")
			registry.set(briefFocusIndexAtom, 1)
			registry.set(briefScrollTopAtom, 5)
			await run(registry, "brief.open-focus")
			registry.set(diffFullViewAtom, true)
			await run(registry, "diff.close")
			const back = { brief: registry.get(briefFullViewAtom), diff: registry.get(diffFullViewAtom), focus: registry.get(briefFocusIndexAtom), scroll: registry.get(briefScrollTopAtom) }
			await run(registry, "brief.close")
			console.log(JSON.stringify({ back, detail: registry.get(detailFullViewAtom), origin: registry.get(diffReturnViewAtom) }))
		`)
		expect(JSON.parse(stdout)).toEqual({ back: { brief: true, diff: false, focus: 1, scroll: 5 }, detail: true, origin: null })
	})

	test("the return path survives the diff view being open for a while", async () => {
		// The return-path atoms are read only by commands; unsubscribed, the registry
		// resets them to their defaults. The views React keeps mounted stay subscribed.
		const stdout = await runIsolatedProbe(`${prelude}
			registerHandoff("openDiffView", () => {})
			const registry = registryWith([[selectedPullRequestAtom, pr], [agentReviewIndexAtom, index(null)], [detailFullViewAtom, true]])
			for (const atom of [selectedPullRequestAtom, agentReviewIndexAtom, detailFullViewAtom, diffFullViewAtom]) registry.subscribe(atom, () => {})
			await run(registry, "brief.open")
			registry.set(briefFocusIndexAtom, 1)
			registry.set(briefScrollTopAtom, 5)
			await run(registry, "brief.open-focus")
			registry.set(diffFullViewAtom, true)
			await new Promise((resolve) => setTimeout(resolve, 50))
			await run(registry, "diff.close")
			const back = { brief: registry.get(briefFullViewAtom), focus: registry.get(briefFocusIndexAtom), scroll: registry.get(briefScrollTopAtom) }
			await new Promise((resolve) => setTimeout(resolve, 50))
			await run(registry, "brief.close")
			console.log(JSON.stringify({ back, detail: registry.get(detailFullViewAtom) }))
		`)
		expect(JSON.parse(stdout)).toEqual({ back: { brief: true, focus: 1, scroll: 5 }, detail: true })
	})

	test("a plain diff or runs open returns to where it came from", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			registerHandoff("openDiffView", () => {})
			const fromDetail = registryWith([[selectedPullRequestAtom, pr], [detailFullViewAtom, true]])
			await run(fromDetail, "diff.open")
			fromDetail.set(detailFullViewAtom, false)
			fromDetail.set(diffFullViewAtom, true)
			await run(fromDetail, "diff.close")
			const fromList = registryWith([[selectedPullRequestAtom, pr]])
			await run(fromList, "diff.open")
			fromList.set(diffFullViewAtom, true)
			await run(fromList, "diff.close")
			const runs = registryWith([[selectedPullRequestAtom, pr], [detailFullViewAtom, true]])
			await run(runs, "runs.open")
			const runsOpen = { runs: runs.get(runsFullViewAtom), detail: runs.get(detailFullViewAtom) }
			await run(runs, "runs.close")
			console.log(JSON.stringify({
				fromDetail: fromDetail.get(detailFullViewAtom),
				fromList: { detail: fromList.get(detailFullViewAtom), brief: fromList.get(briefFullViewAtom) },
				runsOpen,
				runsClosed: { runs: runs.get(runsFullViewAtom), detail: runs.get(detailFullViewAtom) },
			}))
		`)
		expect(JSON.parse(stdout)).toEqual({
			fromDetail: true,
			fromList: { detail: false, brief: false },
			runsOpen: { runs: true, detail: false },
			runsClosed: { runs: false, detail: true },
		})
	})

	test("switching workspace surface forgets the diff's origin", async () => {
		const stdout = await runIsolatedProbe(`${prelude}
			const registry = registryWith([[selectedPullRequestAtom, pr], [diffReturnViewAtom, "brief"], [diffFullViewAtom, true]])
			await run(registry, "workspace.repos")
			console.log(JSON.stringify({ origin: registry.get(diffReturnViewAtom) }))
		`)
		expect(JSON.parse(stdout)).toEqual({ origin: null })
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
