import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { Effect, Schema } from "effect"
import { WorkspacePreferences, type ViewerId, type WorkspacePreferencesInput } from "./workspacePreferences.js"

export const readWorkspacePreferencesFile = (path: string, viewer: ViewerId): Effect.Effect<WorkspacePreferences | null> =>
	Effect.tryPromise(async () => {
		const file = Bun.file(path)
		if (!(await file.exists())) return null
		const preferences = Schema.decodeUnknownSync(WorkspacePreferences)(JSON.parse(await file.text()))
		return preferences.viewer === viewer ? preferences : null
	}).pipe(Effect.catchCause(() => Effect.succeed(null)))

export const writeWorkspacePreferencesFile = (path: string, input: WorkspacePreferencesInput | WorkspacePreferences): Effect.Effect<void> =>
	Effect.tryPromise(async () => {
		const preferences = input instanceof WorkspacePreferences ? input : new WorkspacePreferences(input)
		await mkdir(dirname(path), { recursive: true })
		await Bun.write(path, `${JSON.stringify(preferences, null, "\t")}\n`)
	}).pipe(Effect.catchCause(() => Effect.void))
