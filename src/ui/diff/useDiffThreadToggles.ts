import { useAtom } from "@effect/atom-react"
import { useEffect } from "react"
import { registerHandoff } from "../../commands/handoffs.js"
import type { StackedDiffCommentAnchor, StackedDiffFilePatch } from "../diff.js"
import { diffThreadToggledAtom } from "./threadAtoms.js"
import { diffThreadKeysAtCursor, diffThreadsInFiles, toggleAllDiffThreads, toggleDiffThreads, type DiffThread } from "./threads.js"

export interface UseDiffThreadTogglesInput {
	readonly stackedDiffFiles: readonly StackedDiffFilePatch[]
	readonly selectedDiffCommentAnchor: StackedDiffCommentAnchor | null
	readonly selectedDiffKey: string | null
	readonly diffThreads: ReadonlyMap<string, readonly DiffThread[]>
	readonly flashNotice: (message: string) => void
}

// `c` / `shift+c` in the diff. The commands call "preserveDiffLocation"
// first, so the cursor line keeps its screen row while rows above it grow
// or shrink.
export const useDiffThreadToggles = ({ stackedDiffFiles, selectedDiffCommentAnchor, selectedDiffKey, diffThreads, flashNotice }: UseDiffThreadTogglesInput) => {
	const [toggled, setToggled] = useAtom(diffThreadToggledAtom)
	const allThreads = diffThreadsInFiles(diffThreads, stackedDiffFiles)

	const toggleThreadAtCursor = () => {
		const keys = diffThreadKeysAtCursor(stackedDiffFiles, selectedDiffCommentAnchor, selectedDiffKey)
		if (keys.length === 0) {
			flashNotice("No comments in this file")
			return
		}
		setToggled(toggleDiffThreads(allThreads, keys, toggled))
	}

	const toggleAll = () => {
		if (allThreads.length === 0) {
			flashNotice("No comments on this diff")
			return
		}
		setToggled(toggleAllDiffThreads(allThreads, toggled))
	}

	useEffect(() => registerHandoff("toggleDiffThread", toggleThreadAtCursor))
	useEffect(() => registerHandoff("toggleAllDiffThreads", toggleAll))
}
