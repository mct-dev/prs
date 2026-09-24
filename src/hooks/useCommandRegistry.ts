import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useEffect, useMemo, useRef } from "react"
import type { AppCommand } from "../commands.js"
import { clampCommandIndex, type CommandScope, commandEnabled, defineCommand, filterCommands, sortCommandsByActiveScope } from "../commands.js"
import { commandSnapshotsAtom } from "../commands/atoms.js"
import { dispatchCommandAtom } from "../commands/dispatch.js"
import { commandRuntimeAtom } from "../commands/runtimeAtom.js"
import { canEditComment } from "../ui/comments/useCommentMutations.js"
import type { PullRequestComment } from "../domain.js"
import type { PullRequestView } from "../pullRequestViews.js"
import { parseRepositoryInput } from "../pullRequestViews.js"

interface CommandPaletteShape {
	readonly query: string
	readonly selectedIndex: number
}

export interface UseCommandRegistryInput {
	readonly commandPaletteActive: boolean
	readonly commandPalette: CommandPaletteShape
	readonly selectedRepository: string | null
	readonly switchViewTo: (view: PullRequestView) => void
	readonly commentsViewActive: boolean
	readonly diffFullView: boolean
	readonly detailFullView: boolean
	readonly runtimeSnapshot: {
		readonly readyDiffFileCount: number
		readonly diffFileIndex: number
		readonly selectedDiffCommentAnchorLabel: string | null
		readonly selectedDiffCommentThreadCount: number
		readonly hasDiffCommentThreads: boolean
		readonly diffRangeActive: boolean
		readonly selectedCommentsStatus: "idle" | "loading" | "ready" | "error"
		readonly selectedOrderedComment: PullRequestComment | null
		readonly username: string | null
	}
}

export interface CommandRegistry {
	readonly appCommands: readonly AppCommand[]
	readonly commandPaletteCommands: readonly AppCommand[]
	readonly selectedCommandIndex: number
	readonly selectedCommand: AppCommand | null
	readonly runCommand: (command: AppCommand, options?: { readonly notifyDisabled?: boolean; readonly closePalette?: boolean }) => boolean
	readonly runCommandById: (id: string, options?: { readonly notifyDisabled?: boolean }) => boolean
	readonly runCommandByIdRef: React.MutableRefObject<(id: string, options?: { readonly notifyDisabled?: boolean }) => boolean>
}

export interface UseCommandRegistryFlow extends CommandRegistry {
	readonly closeActiveModal: () => void
	readonly flashNotice: (msg: string) => void
}

/**
 * Wraps the new-style command registry: snapshot atoms → AppCommand[] →
 * fuzzy-filtered palette list. Also keeps `commandRuntimeAtom` in sync
 * with the per-render computed values that derivation atoms consult.
 *
 * `runCommandById` is exposed via ref so callers downstream can fire
 * a command without re-running the effect that installs them.
 */
export const useCommandRegistry = ({
	commandPaletteActive,
	commandPalette,
	selectedRepository,
	switchViewTo,
	commentsViewActive,
	diffFullView,
	detailFullView,
	runtimeSnapshot,
	closeActiveModal,
	flashNotice,
}: UseCommandRegistryInput & { readonly closeActiveModal: () => void; readonly flashNotice: (msg: string) => void }): CommandRegistry => {
	const dispatchCommand = useAtomSet(dispatchCommandAtom, { mode: "promise" })
	const commandSnapshots = useAtomValue(commandSnapshotsAtom)
	const registeredCommands = useMemo<readonly AppCommand[]>(
		() =>
			commandSnapshots.map((snapshot) => ({
				id: snapshot.id,
				title: snapshot.title,
				scope: snapshot.scope,
				...(snapshot.subtitle !== undefined && { subtitle: snapshot.subtitle }),
				...(snapshot.shortcut !== undefined && { shortcut: snapshot.shortcut }),
				...(snapshot.keywords !== undefined && { keywords: snapshot.keywords }),
				disabledReason: snapshot.disabledReason,
				run: () => {
					void dispatchCommand(snapshot.id)
				},
			})),
		[commandSnapshots, dispatchCommand],
	)

	const setCommandRuntime = useAtomSet(commandRuntimeAtom)
	useEffect(() => {
		setCommandRuntime({
			readyDiffFileCount: runtimeSnapshot.readyDiffFileCount,
			diffFileIndex: runtimeSnapshot.diffFileIndex,
			selectedDiffCommentAnchorLabel: runtimeSnapshot.selectedDiffCommentAnchorLabel,
			selectedDiffCommentThreadCount: runtimeSnapshot.selectedDiffCommentThreadCount,
			hasDiffCommentThreads: runtimeSnapshot.hasDiffCommentThreads,
			diffRangeActive: runtimeSnapshot.diffRangeActive,
			hasSelectedComment:
				runtimeSnapshot.selectedCommentsStatus !== "idle" && runtimeSnapshot.selectedCommentsStatus !== "loading" && runtimeSnapshot.selectedOrderedComment !== null,
			canEditSelectedComment: canEditComment(runtimeSnapshot.selectedOrderedComment, runtimeSnapshot.username),
		})
	}, [
		setCommandRuntime,
		runtimeSnapshot.readyDiffFileCount,
		runtimeSnapshot.diffFileIndex,
		runtimeSnapshot.selectedDiffCommentAnchorLabel,
		runtimeSnapshot.selectedDiffCommentThreadCount,
		runtimeSnapshot.hasDiffCommentThreads,
		runtimeSnapshot.diffRangeActive,
		runtimeSnapshot.selectedCommentsStatus,
		runtimeSnapshot.selectedOrderedComment,
		runtimeSnapshot.username,
	])

	const appCommands = registeredCommands
	const runCommand = (command: AppCommand, options: { readonly notifyDisabled?: boolean; readonly closePalette?: boolean } = {}) => {
		if (!commandEnabled(command)) {
			if (options.notifyDisabled && command.disabledReason) flashNotice(command.disabledReason)
			return false
		}
		if (options.closePalette) closeActiveModal()
		command.run()
		return true
	}
	const runCommandById = (id: string, options: { readonly notifyDisabled?: boolean } = {}) => {
		const command = appCommands.find((entry) => entry.id === id)
		return command ? runCommand(command, options) : false
	}
	const runCommandByIdRef = useRef(runCommandById)
	runCommandByIdRef.current = runCommandById

	const dynamicPaletteCommands: readonly AppCommand[] = (() => {
		if (!commandPaletteActive) return []
		const repository = parseRepositoryInput(commandPalette.query)
		if (!repository || repository === selectedRepository) return []
		return [
			defineCommand({
				id: `view.repository.dynamic:${repository}`,
				title: `Open ${repository}`,
				scope: "View",
				subtitle: "Switch to this repository",
				run: () => switchViewTo({ _tag: "Repository", repository }),
			}),
		]
	})()
	const staticPaletteCommands = commandPaletteActive
		? filterCommands(
				appCommands.filter((command) => command.id !== "command.open" && commandEnabled(command)),
				commandPalette.query,
			)
		: []
	const activePaletteScope: CommandScope | null = commentsViewActive ? "Comments" : diffFullView ? "Diff" : detailFullView ? "View" : null
	const commandPaletteCommands = commandPaletteActive
		? [...dynamicPaletteCommands, ...(commandPalette.query.trim().length > 0 ? staticPaletteCommands : sortCommandsByActiveScope(staticPaletteCommands, activePaletteScope))]
		: []
	const selectedCommandIndex = clampCommandIndex(commandPalette.selectedIndex, commandPaletteCommands)
	const selectedCommand = commandPaletteCommands[selectedCommandIndex] ?? null

	return { appCommands, commandPaletteCommands, selectedCommandIndex, selectedCommand, runCommand, runCommandById, runCommandByIdRef }
}
