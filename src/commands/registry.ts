import type * as Effect from "effect/Effect"
import type { Scope } from "effect/Scope"
import type * as Atom from "effect/unstable/reactivity/Atom"
import type { AtomRegistry } from "effect/unstable/reactivity/AtomRegistry"
import type { Reactivity } from "effect/unstable/reactivity/Reactivity"
import type { CommandScope } from "../commands.js"
import type { BrowserOpener } from "../services/BrowserOpener.js"
import type { CacheService } from "../services/CacheService.js"
import type { Clipboard } from "../services/Clipboard.js"
import type { EditorOpener } from "../services/EditorOpener.js"
import type { GitHubService } from "../services/GitHubService.js"

// A `Command` is a *value* — a description of an action and its gating.
// Dynamic fields (title that flips between "Refresh" and "Retry", a disabled
// reason that depends on selection state) are expressed as atoms, evaluated
// against the live registry whenever the palette renders. `run` is an Effect:
// when dispatched it has full access to the GitHub/cache/observability
// layered runtime and to Atom.set/Atom.get for state changes.
//
// Commands never close over component-local state. Any value a command needs
// to read goes through an atom — that's what makes them dispatchable from
// keymap, palette, or any future surface without re-threading dependencies.

export interface CommandDefinition {
	readonly id: string
	readonly scope: CommandScope
	readonly shortcut?: string
	readonly keywords?: readonly string[]
	readonly title: string | Atom.Atom<string>
	readonly subtitle?: string | Atom.Atom<string>
	// When defined and resolved to `false`, the command is hidden from the
	// palette (use for surface-specific commands that have no meaning outside
	// their surface). Most commands set a `disabledReason` instead.
	readonly when?: Atom.Atom<boolean>
	// `null` means enabled; a non-null string disables the command and is
	// shown to the user (e.g. "Select a pull request first.").
	readonly disabledReason?: Atom.Atom<string | null>
	readonly run: CommandEffect
}

// The services a command body may yield. Mirrors the layer set provided by
// `githubRuntime` so commands can require GitHub, cache, clipboard, browser,
// the atom registry, or none of the above.
export type CommandRequirements = AtomRegistry | Reactivity | Scope | BrowserOpener | CacheService | Clipboard | EditorOpener | GitHubService

export type CommandEffect = Effect.Effect<void, unknown, CommandRequirements>

// Preserves the literal type so consumers see the exact id/title etc. Useful
// for autocomplete on command-id constants if we ever surface them as a
// union type.
export const defineCommand = <T extends CommandDefinition>(command: T): T => command
