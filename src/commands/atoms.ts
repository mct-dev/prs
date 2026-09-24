import * as Atom from "effect/unstable/reactivity/Atom"
import type { CommandScope } from "../commands.js"
import { allCommands } from "./index.js"

// A snapshot of a registered command with its dynamic fields resolved
// against current atom state. The palette / keymap layers wrap each snapshot
// with a `run: () => dispatchCommand(snapshot.id)` closure to materialize an
// AppCommand the existing palette helpers can consume.

export interface CommandSnapshot {
	readonly id: string
	readonly title: string
	readonly scope: CommandScope
	readonly subtitle?: string
	readonly shortcut?: string
	readonly keywords?: readonly string[]
	readonly disabledReason: string | null
}

export const commandSnapshotsAtom = Atom.make((get): readonly CommandSnapshot[] => {
	const snapshots: CommandSnapshot[] = []
	for (const command of allCommands) {
		if (command.when && !get(command.when)) continue
		const snapshot: CommandSnapshot = {
			id: command.id,
			title: typeof command.title === "string" ? command.title : get(command.title),
			scope: command.scope,
			...(command.subtitle !== undefined && { subtitle: typeof command.subtitle === "string" ? command.subtitle : get(command.subtitle) }),
			...(command.shortcut !== undefined && { shortcut: command.shortcut }),
			...(command.keywords !== undefined && { keywords: command.keywords }),
			disabledReason: command.disabledReason ? get(command.disabledReason) : null,
		}
		snapshots.push(snapshot)
	}
	return snapshots
})
