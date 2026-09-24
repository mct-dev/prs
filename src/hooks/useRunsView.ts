import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useCallback, useMemo } from "react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type { PullRequestItem, WorkflowRun, WorkflowRunDetails } from "../domain.js"
import type { RunsViewCtx } from "../keymap/runsView.js"
import { openUrlAtom } from "../services/systemAtoms.js"
import {
	pullRequestRunsFor,
	runDetailKey,
	runDetailSelectionAtom,
	runsFullViewAtom,
	runsKey,
	runsListSelectionAtom,
	selectedRunIdAtom,
	workflowRunDetailsFor,
} from "../ui/runs/atoms.js"
import { failureRowIndices, flattenRunRows, type RunDetailRow } from "../ui/runs/runsRows.js"

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)))

type ResultState<A> = { readonly status: "loading" } | { readonly status: "error"; readonly message: string } | { readonly status: "ready"; readonly value: A }

const toState = <A, E>(result: AsyncResult.AsyncResult<A, E>): ResultState<A> => {
	if (AsyncResult.isSuccess(result)) return { status: "ready", value: result.value }
	if (AsyncResult.isFailure(result)) return { status: "error", message: "Failed to load runs" }
	return { status: "loading" }
}

export interface RunsViewModel {
	readonly ctx: RunsViewCtx
	readonly runsFullView: boolean
	readonly inDetail: boolean
	readonly runsState: ResultState<readonly WorkflowRun[]>
	readonly detailState: ResultState<WorkflowRunDetails> | null
	readonly runsSelection: number
	readonly detailSelection: number
	readonly detailRows: readonly RunDetailRow[]
	// Click-to-select then act on a row (run row → open run; detail row → no-op extra).
	readonly selectRow: (index: number) => void
	readonly activateRow: (index: number) => void
}

/**
 * Owns all runs-view atom state + navigation. Self-contained so the runs feature
 * lives in one module rather than threaded through the app-shell God-hook. Reads
 * the runs/detail family atoms (which auto-suspend) and exposes the keymap ctx
 * plus the data the pane renders.
 */
export const useRunsView = (selectedPullRequest: PullRequestItem | null, halfPage: number): RunsViewModel => {
	const [runsFullView, setRunsFullView] = useAtom(runsFullViewAtom)
	const [selectedRunId, setSelectedRunId] = useAtom(selectedRunIdAtom)
	const [runsSelection, setRunsSelection] = useAtom(runsListSelectionAtom)
	const [detailSelection, setDetailSelection] = useAtom(runDetailSelectionAtom)
	const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })

	const runsListKey = selectedPullRequest ? runsKey(selectedPullRequest) : null
	const runsResult = useAtomValue(pullRequestRunsFor(runsListKey ?? "\u0000\u0000"))
	const runsState = useMemo<ResultState<readonly WorkflowRun[]>>(() => toState(runsResult), [runsResult])
	const runs: readonly WorkflowRun[] = runsState.status === "ready" ? runsState.value : []

	const inDetail = selectedRunId !== null
	const detailAtomKey = selectedPullRequest && selectedRunId !== null ? runDetailKey(selectedPullRequest.repository, selectedRunId) : null
	const detailResult = useAtomValue(workflowRunDetailsFor(detailAtomKey ?? "\u0000\u0000"))
	const detailState = detailAtomKey ? toState(detailResult) : null
	const detailRun = detailState?.status === "ready" ? detailState.value : null
	const detailRows = useMemo(() => (detailRun ? flattenRunRows(detailRun) : []), [detailRun])

	const closeRunsView = useCallback(() => {
		setRunsFullView(false)
		setSelectedRunId(null)
	}, [setRunsFullView, setSelectedRunId])

	const backToList = useCallback(() => {
		setSelectedRunId(null)
		setDetailSelection(0)
	}, [setSelectedRunId, setDetailSelection])

	const handleEscape = useCallback(() => {
		if (inDetail) backToList()
		else closeRunsView()
	}, [inDetail, backToList, closeRunsView])

	const moveSelection = useCallback(
		(delta: number) => {
			if (inDetail) setDetailSelection((current) => clamp(current + delta, detailRows.length - 1))
			else setRunsSelection((current) => clamp(current + delta, runs.length - 1))
		},
		[inDetail, detailRows.length, runs.length, setDetailSelection, setRunsSelection],
	)

	const moveSelectionToBoundary = useCallback(
		(boundary: "first" | "last") => {
			if (inDetail) setDetailSelection(boundary === "first" ? 0 : Math.max(0, detailRows.length - 1))
			else setRunsSelection(boundary === "first" ? 0 : Math.max(0, runs.length - 1))
		},
		[inDetail, detailRows.length, runs.length, setDetailSelection, setRunsSelection],
	)

	const openRunAt = useCallback(
		(index: number) => {
			const run = runs[index]
			if (!run) return
			setSelectedRunId(run.id)
			setDetailSelection(0)
		},
		[runs, setSelectedRunId, setDetailSelection],
	)

	const openStepLogAt = useCallback(
		(index: number) => {
			const row = detailRows[index]
			const url = row?.kind === "step" ? row.job.url : detailRun?.url
			if (url) void openUrl(url)
		},
		[detailRows, detailRun, openUrl],
	)

	// `enter` (or click-activate): open the focused run, or open the focused
	// step's job log in the browser. There's no inline log expansion in slice 1.
	const openSelected = useCallback(() => {
		if (inDetail) openStepLogAt(detailSelection)
		else openRunAt(runsSelection)
	}, [inDetail, openStepLogAt, openRunAt, detailSelection, runsSelection])

	const jumpFailure = useCallback(
		(direction: 1 | -1) => {
			if (!inDetail) return
			const failures = failureRowIndices(detailRows)
			if (failures.length === 0) return
			const current = detailSelection
			const next =
				direction === 1 ? (failures.find((index) => index > current) ?? failures[0]!) : ([...failures].reverse().find((index) => index < current) ?? failures[failures.length - 1]!)
			setDetailSelection(next)
		},
		[inDetail, detailRows, detailSelection, setDetailSelection],
	)

	const openInBrowser = useCallback(() => {
		const url = inDetail ? detailRun?.url : runs[runsSelection]?.url
		if (url) void openUrl(url)
	}, [inDetail, detailRun, runs, runsSelection, openUrl])

	// Mouse: first click selects the row, second (or click on the already-selected
	// row) activates it — opening a run, or a step's log in the browser.
	const selectRow = useCallback(
		(index: number) => {
			if (inDetail) setDetailSelection(clamp(index, detailRows.length - 1))
			else setRunsSelection(clamp(index, runs.length - 1))
		},
		[inDetail, detailRows.length, runs.length, setDetailSelection, setRunsSelection],
	)

	const activateRow = useCallback(
		(index: number) => {
			if (inDetail) openStepLogAt(index)
			else openRunAt(index)
		},
		[inDetail, openStepLogAt, openRunAt],
	)

	const refresh = useCallback(() => {
		// Family atoms refresh on re-read via setIdleTTL(0); nudging selection is
		// enough to re-trigger. A dedicated refresh is wired through the command.
	}, [])

	const ctx: RunsViewCtx = useMemo(
		() => ({
			halfPage,
			inDetail,
			handleEscape,
			moveSelection,
			moveSelectionToBoundary,
			openSelected,
			nextFailure: () => jumpFailure(1),
			previousFailure: () => jumpFailure(-1),
			refresh,
			openInBrowser,
		}),
		[halfPage, inDetail, handleEscape, moveSelection, moveSelectionToBoundary, openSelected, jumpFailure, refresh, openInBrowser],
	)

	return {
		ctx,
		runsFullView,
		inDetail,
		runsState,
		detailState,
		runsSelection: clamp(runsSelection, runs.length - 1),
		detailSelection: clamp(detailSelection, detailRows.length - 1),
		detailRows,
		selectRow,
		activateRow,
	}
}
