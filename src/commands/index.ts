import { globalCommands } from "./builtins.js"
import type { CommandDefinition } from "./registry.js"

// Single source of truth for the new command registry. Add a category here as
// each one is ported off `appCommands.ts`. Once everything is ported,
// `commands/builtins.ts` becomes the only place commands are declared.

export const allCommands: readonly CommandDefinition[] = [...globalCommands]

export const commandsById: ReadonlyMap<string, CommandDefinition> = new Map(allCommands.map((command) => [command.id, command]))
