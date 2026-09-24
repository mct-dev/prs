import { Schema } from "effect"

export const ViewerId = Schema.String.pipe(Schema.brand("ViewerId"))
export type ViewerId = Schema.Schema.Type<typeof ViewerId>

export const RepositoryId = Schema.String.pipe(Schema.brand("RepositoryId"))
export type RepositoryId = Schema.Schema.Type<typeof RepositoryId>

export class WorkspacePreferences extends Schema.Class<WorkspacePreferences>("WorkspacePreferences")({
	viewer: ViewerId,
	favoriteRepositories: Schema.Array(RepositoryId),
	recentRepositories: Schema.Array(RepositoryId),
}) {}

export type WorkspacePreferencesInput = ConstructorParameters<typeof WorkspacePreferences>[0]

export const viewerId = (value: string): ViewerId => Schema.decodeUnknownSync(ViewerId)(value)
export const repositoryId = (value: string): RepositoryId => Schema.decodeUnknownSync(RepositoryId)(value)

export const makeWorkspacePreferences = (input: WorkspacePreferencesInput): WorkspacePreferences => new WorkspacePreferences(input)
