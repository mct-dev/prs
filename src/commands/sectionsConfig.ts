import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { errorMessage } from "../errors.js"
import { loadSectionsConfig, sectionsConfigPath } from "../sections/config.js"
import { defaultMyTeams } from "../sections/teams.js"
import {
	configuredMyTeams,
	HAND_EDIT_MY_TEAMS,
	ensureSectionsConfigFile,
	myTeamsUnchanged,
	readTextIfExists,
	SECTIONS_TEMPLATE,
	setMyTeamsInYaml,
	writeFileAtomic,
} from "../sections/template.js"
import { EditorOpener } from "../services/EditorOpener.js"
import { GitHubService } from "../services/GitHubService.js"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { teamsModalRows } from "../ui/modals/teamsModalState.js"
import { initialTeamsModalState, Modal, type TeamsModalState } from "../ui/modals/types.js"
import { noticeAtom } from "../ui/notice/atoms.js"
import { sectionsConfigErrorAtom } from "../ui/pullRequests/atoms.js"
import { invokeHandoff } from "./handoffs.js"
import { defineCommand, type CommandDefinition } from "./registry.js"

// "Edit sections config" and "Choose my teams": both write sections.yaml and
// then reload the sections view from it.

/**
 * Mock mode never writes the real ~/.config file; it can still write one
 * named by PRS_SECTIONS_PATH (tests, demos).
 */
const sectionsConfigWritable = () => !process.env.GHUI_MOCK_PR_COUNT || Boolean(process.env.PRS_SECTIONS_PATH)

const readConfigText = (path: string) => Effect.tryPromise({ try: () => readTextIfExists(path), catch: (error) => new Error(`Can't read ${path}: ${errorMessage(error)}`) })

/** Re-read sections.yaml, show any error, and refetch. */
const reloadSections = (path: string, okMessage: string) =>
	Effect.gen(function* () {
		const loaded = yield* Effect.promise(() => loadSectionsConfig(path))
		yield* Atom.set(sectionsConfigErrorAtom, loaded.error)
		invokeHandoff("reloadSections")
		yield* Atom.set(noticeAtom, loaded.error ? `${loaded.error} (showing defaults)` : okMessage)
	})

const teamsModalActiveAtom = Atom.make((get) => Modal.$is("Teams")(get(activeModalAtom)))

const updateTeamsModal = (update: (state: TeamsModalState) => TeamsModalState) =>
	Atom.update(activeModalAtom, (modal) => (Modal.$is("Teams")(modal) ? Modal.Teams(update(modal)) : modal))

export const sectionsConfigCommands: readonly CommandDefinition[] = [
	defineCommand({
		id: "sections.edit-config",
		title: "Edit sections config",
		scope: "View",
		subtitle: "Open sections.yaml in $EDITOR, reload on exit",
		keywords: ["sections", "yaml", "config", "configure", "customize", "queries", "editor"],
		run: Effect.gen(function* () {
			const path = sectionsConfigPath()
			if (!sectionsConfigWritable()) {
				yield* Atom.set(noticeAtom, `Mock mode: not creating ${path}`)
				return
			}
			const created = yield* Effect.tryPromise({ try: () => ensureSectionsConfigFile(path), catch: (error) => error }).pipe(
				Effect.catch((error) => Atom.set(noticeAtom, `Can't create ${path}: ${errorMessage(error)}`).pipe(Effect.as(null))),
			)
			if (created === null) return
			const opened = yield* EditorOpener.use((opener) => opener.editFile(path)).pipe(
				Effect.as(true),
				Effect.catch((error) => Atom.set(noticeAtom, errorMessage(error)).pipe(Effect.as(false))),
			)
			if (!opened) return
			yield* reloadSections(path, created ? `Created ${path}; sections reloaded` : "Sections reloaded")
		}),
	}),
	defineCommand({
		id: "sections.choose-teams",
		title: "Choose my teams",
		scope: "View",
		subtitle: "Pick the teams behind {my_teams} in sections",
		keywords: ["sections", "teams", "my_teams", "team", "config"],
		run: Effect.gen(function* () {
			yield* Atom.set(activeModalAtom, Modal.Teams(initialTeamsModalState))
			const teams = yield* GitHubService.use((github) => github.listViewerTeamsDetailed()).pipe(
				Effect.catch((error) => updateTeamsModal((state) => ({ ...state, loading: false, error: `Couldn't load teams: ${errorMessage(error)}` })).pipe(Effect.as(null))),
			)
			if (teams === null) return
			const text = yield* readConfigText(sectionsConfigPath()).pipe(
				Effect.catch((error) => updateTeamsModal((state) => ({ ...state, loading: false, error: error.message })).pipe(Effect.as(undefined))),
			)
			if (text === undefined) return
			const inEffect = configuredMyTeams(text ?? SECTIONS_TEMPLATE) ?? defaultMyTeams(teams)
			yield* updateTeamsModal(() => ({
				teams: teamsModalRows(teams, inEffect),
				chosen: inEffect,
				initial: inEffect,
				selectedIndex: 0,
				loading: false,
				error: null,
			}))
		}),
	}),
	defineCommand({
		id: "sections.save-teams",
		title: "Save my teams",
		scope: "View",
		subtitle: "Write the checked teams to vars.my_teams",
		keywords: ["sections", "teams", "my_teams", "save"],
		when: teamsModalActiveAtom,
		run: Effect.gen(function* () {
			const modal = yield* Atom.get(activeModalAtom)
			if (!Modal.$is("Teams")(modal) || modal.loading) return
			if (modal.chosen.length === 0) {
				yield* updateTeamsModal((state) => ({ ...state, error: "Pick at least one team (space toggles)." }))
				return
			}
			if (myTeamsUnchanged(modal.initial, modal.chosen)) {
				yield* Atom.set(activeModalAtom, Modal.None())
				yield* Atom.set(noticeAtom, "my_teams unchanged")
				return
			}
			const path = sectionsConfigPath()
			if (!sectionsConfigWritable()) {
				yield* Atom.set(activeModalAtom, Modal.None())
				yield* Atom.set(noticeAtom, `Mock mode: my_teams not saved (${modal.chosen.join(", ")})`)
				return
			}
			const text = yield* readConfigText(path).pipe(Effect.catch((error) => updateTeamsModal((state) => ({ ...state, error: error.message })).pipe(Effect.as(undefined))))
			if (text === undefined) return
			// Start from the template when the file is missing: a vars-only file has no sections and would be rejected.
			const next = setMyTeamsInYaml(text ?? SECTIONS_TEMPLATE, modal.chosen)
			if ("error" in next) {
				yield* updateTeamsModal((state) => ({ ...state, error: next.error === HAND_EDIT_MY_TEAMS ? next.error : `Fix sections.yaml first: ${next.error}` }))
				return
			}
			const written = yield* Effect.tryPromise({
				try: () => writeFileAtomic(path, next.text),
				catch: (error) => error,
			}).pipe(
				Effect.as(true),
				Effect.catch((error) => updateTeamsModal((state) => ({ ...state, error: `Can't write ${path}: ${errorMessage(error)}` })).pipe(Effect.as(false))),
			)
			if (!written) return
			yield* Atom.set(activeModalAtom, Modal.None())
			yield* reloadSections(path, `my_teams: ${modal.chosen.join(", ")}`)
		}),
	}),
]
