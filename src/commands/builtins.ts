import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { errorMessage } from "../errors.js"
import { AgentRunner } from "../services/AgentRunner.js"
import { BrowserOpener } from "../services/BrowserOpener.js"
import { Clipboard } from "../services/Clipboard.js"
import { EditorOpener } from "../services/EditorOpener.js"
import { GitHubService } from "../services/GitHubService.js"
import { saveStoredDiffWhitespaceMode } from "../themeStore.js"
import { commentsViewActiveAtom, selectedCommentKeyAtom } from "../ui/comments/atoms.js"
import { detailFullViewAtom, detailScrollOffsetAtom } from "../ui/detail/atoms.js"
import { diffCommentRangeStartIndexAtom, diffFullViewAtom, diffRenderViewAtom, diffWhitespaceModeAtom, diffWrapModeAtom } from "../ui/diff/atoms.js"
import { pullRequestRunsFor, runDetailSelectionAtom, runsFullViewAtom, runsKey, runsListSelectionAtom, selectedRunIdAtom } from "../ui/runs/atoms.js"
import { filterDraftAtom, filterModeAtom, filterQueryAtom } from "../ui/filter/atoms.js"
import { selectedIssueAtom } from "../ui/issues/atoms.js"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { submitReviewOptions } from "../ui/modals/shared.js"
import { reviewPresetOptions } from "../ui/modals/ReviewPresetModal.js"
import { initialCommandPaletteState, initialCommentModalState, initialOpenRepositoryModalState, initialReviewPresetModalState, Modal } from "../ui/modals/types.js"
import { noticeAtom } from "../ui/notice/atoms.js"
import { currentReturnView, diffReturnViewAtom, restoreReturnView, runsReturnViewAtom } from "../ui/viewReturn.js"
import { briefStatusFor } from "../ui/review/atoms.js"
import {
	briefFocusIndexAtom,
	briefFullViewAtom,
	briefReturnToDetailAtom,
	briefScrollTopAtom,
	pendingBriefDiffTargetAtom,
	selectedReviewEntryAtom,
} from "../ui/review/briefViewAtoms.js"
import type { PullRequestItem, PullRequestUserQueueMode } from "../domain.js"
import { pullRequestQueueModes } from "../domain.js"
import { issueMetadataText, pullRequestMetadataText } from "../ui/pullRequests.js"
import { labelCacheAtom, selectedPullRequestAtom } from "../ui/pullRequests/atoms.js"
import { selectedRepositoryAtom, workspaceSurfaceAtom, workspaceTabSurfacesAtom } from "../workspace/atoms.js"
import { type WorkspaceSurface, workspaceSurfaceLabels, workspaceSurfaces } from "../workspaceSurfaces.js"
import {
	changedFilesReasonAtom,
	changedFilesSubtitleAtom,
	detailCloseDisabledReasonAtom,
	diffCloseDisabledReasonAtom,
	diffCommentAnchorSubtitleAtom,
	diffFileSubtitleAtom,
	diffOpenCommentTargetTitleAtom,
	diffOpenRequiredReasonAtom,
	diffReloadDisabledReasonAtom,
	diffThreadReasonAtom,
	diffThreadSubtitleAtom,
	diffToggleRangeTitleAtom,
	filterClearDisabledReasonAtom,
	filterTitleAtom,
	issueSelectedReasonAtom,
	issueSurfaceReasonAtom,
	noOpenIssueReasonAtom,
	loadMoreDisabledReasonAtom,
	loadMoreSubtitleAtom,
	noOpenPullRequestReasonAtom,
	noPullRequestReasonAtom,
	noSelectedItemReasonAtom,
	ownCommentReasonAtom,
	pullRequestRefreshTitleAtom,
	pullRequestSurfaceReasonAtom,
	repositoryOpenSubtitleAtom,
	selectedCommentReasonAtom,
	selectedCommentSubjectAtom,
	selectedDiffLineReasonAtom,
	selectedIssueLabelAtom,
	selectedItemLabelAtom,
	selectedPullRequestLabelAtom,
	queueViewAlreadyActiveReasonAtom,
	queueViewSubtitleAtom,
	queueViewTitleFor,
	repositoryViewAlreadyActiveReasonAtom,
	repositoryViewAvailableAtom,
	repositoryViewSubtitleAtom,
	repositoryViewTitleAtom,
	runsCloseDisabledReasonAtom,
	briefCloseDisabledReasonAtom,
	sectionsViewAlreadyActiveReasonAtom,
	sectionsViewInactiveReasonAtom,
	sectionsViewSubtitleAtom,
	workspaceSurfaceAlreadyActiveReasonAtom,
	workspaceSurfaceSubtitleAtom,
} from "./derivations.js"
import { invokeHandoff } from "./handoffs.js"
import { defineCommand, type CommandDefinition } from "./registry.js"

// Most commands fall into one of three shapes:
//   1. "Open this modal": yield* Atom.set(activeModalAtom, Modal.X(...))
//   2. "Toggle this atom": yield* Atom.update(atom, …)
//   3. "Read selection, do thing with service": Effect.gen reading selection
//      via Atom.get and calling Clipboard.use / BrowserOpener.use / ...
//
// Everything is dispatchable by id and depends only on atoms — no closures
// over component-local state.

const queueModeHandoffKey = (mode: PullRequestUserQueueMode) =>
	mode === "authored" ? ("viewAuthored" as const) : mode === "review" ? ("viewReview" as const) : mode === "assigned" ? ("viewAssigned" as const) : ("viewMentioned" as const)

const queueViewCommands = pullRequestQueueModes.map(
	(mode): CommandDefinition =>
		defineCommand({
			id: `view.${mode}`,
			title: queueViewTitleFor(mode),
			scope: "View",
			subtitle: queueViewSubtitleAtom(mode),
			keywords: [mode, "queue", "view"],
			disabledReason: queueViewAlreadyActiveReasonAtom(mode),
			run: Effect.sync(() => invokeHandoff(queueModeHandoffKey(mode))),
		}),
)

const workspaceSurfaceCommands = workspaceSurfaces.map((surface, index): CommandDefinition => {
	const subtitleAtom = workspaceSurfaceSubtitleAtom(surface)
	const disabledAtom = workspaceSurfaceAlreadyActiveReasonAtom(surface)
	return defineCommand({
		id: `workspace.${surface}`,
		title: `Show ${workspaceSurfaceLabels[surface]}`,
		scope: "View",
		subtitle: subtitleAtom,
		shortcut: `${index + 1}`,
		keywords: [workspaceSurfaceLabels[surface], "workspace", "surface", "tab"],
		disabledReason: disabledAtom,
		run: switchWorkspaceSurfaceEffect(surface),
	})
})

function switchWorkspaceSurfaceEffect(surface: WorkspaceSurface) {
	return Effect.gen(function* () {
		const allowed = yield* Atom.get(workspaceTabSurfacesAtom)
		if (!allowed.includes(surface)) return
		const current = yield* Atom.get(workspaceSurfaceAtom)
		if (current === surface) return
		yield* Atom.set(workspaceSurfaceAtom, surface)
		yield* Atom.set(detailFullViewAtom, false)
		yield* Atom.set(diffFullViewAtom, false)
		yield* Atom.set(commentsViewActiveAtom, false)
		yield* Atom.set(briefFullViewAtom, false)
		yield* Atom.set(diffReturnViewAtom, null)
		yield* Atom.set(runsReturnViewAtom, null)
		yield* Atom.set(diffCommentRangeStartIndexAtom, null)
		yield* Atom.set(filterModeAtom, false)
		const query = yield* Atom.get(filterQueryAtom)
		yield* Atom.set(filterDraftAtom, query)
		yield* Atom.set(noticeAtom, null)
	})
}

const flashErrorEffect = (error: unknown) =>
	Effect.gen(function* () {
		yield* Atom.set(noticeAtom, errorMessage(error))
	})

const agentReviewCancelReasonAtom = Atom.make((get): string | null => {
	const reason = get(noPullRequestReasonAtom)
	if (reason !== null) return reason
	const pr = get(selectedPullRequestAtom)
	if (!pr) return "Select a pull request first."
	return get(briefStatusFor(pr))._tag === "running" ? null : "No agent review is running."
})

/**
 * Start a read-only agent review for `pr`, unless one is already running for
 * it. The runner only dedupes identical (head, preset) runs, so a different
 * preset would otherwise start a second concurrent agent on the same PR.
 */
const startAgentReviewEffect = (pr: PullRequestItem, presetId: string | null) =>
	Effect.gen(function* () {
		const status = yield* Atom.get(briefStatusFor(pr))
		if (status._tag === "running") {
			yield* Atom.set(noticeAtom, `Agent review already running for #${pr.number}`)
			return
		}
		yield* AgentRunner.use((runner) => runner.startReview(pr, presetId)).pipe(
			Effect.flatMap(() => Atom.set(noticeAtom, presetId ? `Agent review (${presetId}) started for #${pr.number}` : `Agent review started for #${pr.number}`)),
			Effect.catch(flashErrorEffect),
		)
	})

const reviewPresetModalActiveAtom = Atom.make((get) => Modal.$is("ReviewPreset")(get(activeModalAtom)))

export const globalCommands: readonly CommandDefinition[] = [
	defineCommand({
		id: "command.open",
		title: "Open command palette",
		scope: "Global",
		subtitle: "Search every available route through prs",
		shortcut: "ctrl-p/cmd-k",
		keywords: ["palette", "commands", "deck", "help", "keys", "keyboard", "shortcuts"],
		run: Atom.set(activeModalAtom, Modal.CommandPalette(initialCommandPaletteState)),
	}),
	defineCommand({
		id: "filter.open",
		title: filterTitleAtom,
		scope: "Global",
		subtitle: "Search the visible surface",
		shortcut: "/",
		keywords: ["search"],
		run: Effect.gen(function* () {
			const query = yield* Atom.get(filterQueryAtom)
			yield* Atom.set(filterDraftAtom, query)
			yield* Atom.set(filterModeAtom, true)
		}),
	}),
	defineCommand({
		id: "filter.clear",
		title: "Clear filter",
		scope: "Global",
		subtitle: "Show every item in the current surface",
		shortcut: "esc",
		disabledReason: filterClearDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(filterQueryAtom, "")
			yield* Atom.set(filterDraftAtom, "")
			yield* Atom.set(filterModeAtom, false)
		}),
	}),
	defineCommand({
		id: "legend.open",
		title: "Show icon legend",
		scope: "Global",
		subtitle: "What the review, check and brief icons mean",
		shortcut: "?",
		keywords: ["help", "icons", "glyphs", "legend", "key", "symbols"],
		run: Atom.set(activeModalAtom, Modal.Legend()),
	}),

	// === Workspace surface switches ===
	...workspaceSurfaceCommands,

	// === Detail / diff toggles ===
	defineCommand({
		id: "detail.open",
		title: "Open details",
		scope: "View",
		subtitle: selectedItemLabelAtom,
		shortcut: "enter",
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(briefFullViewAtom, false)
			yield* Atom.set(detailFullViewAtom, true)
			yield* Atom.set(detailScrollOffsetAtom, 0)
		}),
	}),
	defineCommand({
		id: "detail.close",
		title: "Close details view",
		scope: "Pull request",
		subtitle: "Return to the queue",
		shortcut: "esc",
		disabledReason: detailCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(detailFullViewAtom, false)
			yield* Atom.set(detailScrollOffsetAtom, 0)
		}),
	}),
	// === Diff render-mode toggles ===
	// These three preserve the user's scroll position across the re-render
	// they trigger by calling the "preserveDiffLocation" handoff *synchronously*
	// before the atom write. The diff-location-preservation hook captured
	// the pre-mutation anchor + screenOffset at that moment.
	defineCommand({
		id: "diff.toggle-view",
		title: "Toggle diff split/unified view",
		scope: "Diff",
		subtitle: Atom.make((get) => (get(diffRenderViewAtom) === "split" ? "Switch to unified view" : "Switch to split view")),
		shortcut: "shift-v",
		disabledReason: diffOpenRequiredReasonAtom,
		run: Effect.gen(function* () {
			yield* Effect.sync(() => invokeHandoff("preserveDiffLocation"))
			yield* Atom.update(diffRenderViewAtom, (current) => (current === "split" ? "unified" : "split"))
		}),
	}),
	defineCommand({
		id: "diff.toggle-wrap",
		title: "Toggle diff word wrap",
		scope: "Diff",
		subtitle: Atom.make((get) => (get(diffWrapModeAtom) === "none" ? "Wrap long diff lines" : "Keep diff lines unwrapped")),
		shortcut: "w",
		disabledReason: diffOpenRequiredReasonAtom,
		run: Effect.gen(function* () {
			yield* Effect.sync(() => invokeHandoff("preserveDiffLocation"))
			yield* Atom.update(diffWrapModeAtom, (current) => (current === "none" ? "word" : "none"))
		}),
	}),
	defineCommand({
		id: "diff.toggle-whitespace",
		title: Atom.make((get) => (get(diffWhitespaceModeAtom) === "ignore" ? "Show whitespace changes" : "Ignore whitespace changes")),
		scope: "Diff",
		subtitle: Atom.make((get) => (get(diffWhitespaceModeAtom) === "ignore" ? "Display the original GitHub patch" : "Hide whitespace-only line changes")),
		disabledReason: diffOpenRequiredReasonAtom,
		keywords: ["whitespace", "spacing", "ignore", "show"],
		run: Effect.gen(function* () {
			yield* Effect.sync(() => invokeHandoff("preserveDiffLocation"))
			const current = yield* Atom.get(diffWhitespaceModeAtom)
			const next = current === "ignore" ? "show" : "ignore"
			yield* Atom.set(diffWhitespaceModeAtom, next)
			yield* saveStoredDiffWhitespaceMode(next)
		}),
	}),

	defineCommand({
		id: "diff.close",
		title: "Close diff view",
		scope: "Diff",
		subtitle: "Return to the queue or detail view",
		shortcut: "esc",
		disabledReason: diffCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(diffFullViewAtom, false)
			yield* Atom.set(diffCommentRangeStartIndexAtom, null)
			yield* restoreReturnView(diffReturnViewAtom)
			// A brief target still waiting on the diff must not land on a later open.
			yield* Atom.set(pendingBriefDiffTargetAtom, null)
		}),
	}),

	// === Runs cluster (per-PR workflow runs view) ===
	defineCommand({
		id: "runs.open",
		title: "Open workflow runs",
		scope: "Runs",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "a",
		keywords: ["actions", "ci", "workflow", "checks", "runs", "jobs"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* Atom.set(selectedRunIdAtom, null)
			yield* Atom.set(runsListSelectionAtom, 0)
			yield* Atom.set(runDetailSelectionAtom, 0)
			yield* Atom.set(runsReturnViewAtom, yield* currentReturnView)
			yield* Atom.set(diffFullViewAtom, false)
			yield* Atom.set(detailFullViewAtom, false)
			yield* Atom.set(commentsViewActiveAtom, false)
			yield* Atom.set(briefFullViewAtom, false)
			yield* Atom.set(runsFullViewAtom, true)
		}),
	}),
	defineCommand({
		id: "runs.close",
		title: "Close workflow runs",
		scope: "Runs",
		subtitle: "Return to the pull request",
		shortcut: "esc",
		disabledReason: runsCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(runsFullViewAtom, false)
			yield* Atom.set(selectedRunIdAtom, null)
			yield* restoreReturnView(runsReturnViewAtom)
		}),
	}),
	defineCommand({
		id: "runs.refresh",
		title: "Refresh workflow runs",
		scope: "Runs",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "r",
		disabledReason: runsCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* Atom.refresh(pullRequestRunsFor(runsKey(pr)))
		}),
	}),
	// === Brief cluster (full agent review brief view) ===
	defineCommand({
		id: "brief.open",
		title: "Open agent review brief",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "v",
		keywords: ["agent", "ai", "brief", "risk", "review", "focus"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* Atom.set(briefReturnToDetailAtom, yield* Atom.get(detailFullViewAtom))
			yield* Atom.set(briefFocusIndexAtom, 0)
			yield* Atom.set(briefScrollTopAtom, 0)
			yield* Atom.set(diffFullViewAtom, false)
			yield* Atom.set(detailFullViewAtom, false)
			yield* Atom.set(commentsViewActiveAtom, false)
			yield* Atom.set(runsFullViewAtom, false)
			yield* Atom.set(selectedRunIdAtom, null)
			yield* Atom.set(pendingBriefDiffTargetAtom, null)
			yield* Atom.set(briefFullViewAtom, true)
		}),
	}),
	defineCommand({
		id: "brief.close",
		title: "Close agent review brief",
		scope: "Pull request",
		subtitle: "Return to the pull request",
		shortcut: "esc",
		disabledReason: briefCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(briefFullViewAtom, false)
			if (yield* Atom.get(briefReturnToDetailAtom)) {
				yield* Atom.set(detailFullViewAtom, true)
				yield* Atom.set(detailScrollOffsetAtom, 0)
			}
			yield* Atom.set(briefReturnToDetailAtom, false)
		}),
	}),
	defineCommand({
		id: "brief.open-focus",
		title: "Open diff at focus area",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		keywords: ["agent", "brief", "focus", "diff"],
		when: briefFullViewAtom,
		disabledReason: briefCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			const entry = yield* Atom.get(selectedReviewEntryAtom)
			const area = entry?.brief?.focus_areas[yield* Atom.get(briefFocusIndexAtom)]
			if (!pullRequest || !area) return
			yield* Atom.set(pendingBriefDiffTargetAtom, { url: pullRequest.url, headSha: entry.record.headSha, file: area.file, lines: area.lines ?? null })
			// esc from the diff comes back here; the brief's own return-to-detail flag stays set.
			yield* Atom.set(diffReturnViewAtom, "brief")
			yield* Atom.set(briefFullViewAtom, false)
			yield* Effect.sync(() => invokeHandoff("openDiffView"))
		}),
	}),
	defineCommand({
		id: "brief.open-log",
		title: "Open agent review log",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		keywords: ["agent", "brief", "log", "pager", "transcript"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const logPath = (yield* Atom.get(selectedReviewEntryAtom))?.record.logPath ?? null
			if (!logPath) {
				yield* Atom.set(noticeAtom, "No agent review log for this pull request.")
				return
			}
			// Fall back to showing the path when the pager can't run.
			yield* EditorOpener.use((opener) => opener.pageFile(logPath)).pipe(Effect.catch(() => Atom.set(noticeAtom, `Agent log: ${logPath}`)))
		}),
	}),

	// === Modal openers (selection-seeded) ===
	defineCommand({
		id: "repository.open",
		title: "Open repository...",
		scope: "View",
		subtitle: repositoryOpenSubtitleAtom,
		keywords: ["repo", "repository", "owner", "github"],
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			yield* Atom.set(activeModalAtom, Modal.OpenRepository({ ...initialOpenRepositoryModalState, query: repository ?? "" }))
		}),
	}),
	defineCommand({
		id: "pull.close",
		title: "Close pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "x",
		disabledReason: noOpenPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || pr.state !== "open") return
			yield* Atom.set(
				activeModalAtom,
				Modal.Close({
					kind: "pullRequest",
					repository: pr.repository,
					number: pr.number,
					title: pr.title,
					url: pr.url,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "issue.close",
		title: "Close issue",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		shortcut: "x",
		keywords: ["close", "resolve"],
		disabledReason: noOpenIssueReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue || issue.state !== "open") return
			yield* Atom.set(
				activeModalAtom,
				Modal.Close({
					kind: "issue",
					repository: issue.repository,
					number: issue.number,
					title: issue.title,
					url: issue.url,
					running: false,
					error: null,
				}),
			)
		}),
	}),

	// === Pull request state / review modals ===
	defineCommand({
		id: "pull.toggle-draft",
		title: Atom.make((get) => (get(selectedPullRequestAtom)?.reviewStatus === "draft" ? "Mark ready for review" : "Convert to draft")),
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "s",
		disabledReason: noOpenPullRequestReasonAtom,
		keywords: ["state", "ready"],
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || pr.state !== "open") return
			const isDraft = pr.reviewStatus === "draft"
			yield* Atom.set(
				activeModalAtom,
				Modal.PullRequestState({
					repository: pr.repository,
					number: pr.number,
					title: pr.title,
					url: pr.url,
					isDraft,
					selectedIsDraft: !isDraft,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "pull.submit-review",
		title: "Review pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "shift-r",
		disabledReason: noOpenPullRequestReasonAtom,
		keywords: ["review", "approve", "request changes", "comment"],
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || pr.state !== "open") return
			const selectedIndex = Math.max(
				0,
				submitReviewOptions.findIndex((option) => option.event === "APPROVE"),
			)
			yield* Atom.set(
				activeModalAtom,
				Modal.SubmitReview({
					repository: pr.repository,
					number: pr.number,
					focus: "action",
					selectedIndex,
					body: "",
					cursor: 0,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "comments.new",
		title: "New comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "a",
		keywords: ["add", "post", "issue comment"],
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			const subject = yield* Atom.get(selectedCommentSubjectAtom)
			const key = yield* Atom.get(selectedCommentKeyAtom)
			if (!subject || !key) return
			const surface = yield* Atom.get(workspaceSurfaceAtom)
			yield* Atom.set(
				activeModalAtom,
				Modal.Comment({
					...initialCommentModalState,
					target: { kind: "issue", subject: { repository: subject.repository, number: subject.number, key, issueUrl: surface === "issues" ? subject.url : null } },
				}),
			)
		}),
	}),
	defineCommand({
		id: "pull.labels",
		title: "Manage labels",
		scope: "Labels",
		subtitle: selectedItemLabelAtom,
		shortcut: "l",
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			const subject = yield* Atom.get(selectedCommentSubjectAtom)
			if (!subject) return
			const repository = subject.repository
			const surface = yield* Atom.get(workspaceSurfaceAtom)
			const target = { kind: surface === "issues" ? ("issue" as const) : ("pullRequest" as const), repository, number: subject.number, url: subject.url, labels: subject.labels }
			const cache = yield* Atom.get(labelCacheAtom)
			const cached = cache[repository]
			if (cached) {
				yield* Atom.set(activeModalAtom, Modal.Label({ repository, target, query: "", selectedIndex: 0, availableLabels: cached, loading: false }))
				return
			}
			yield* Atom.set(activeModalAtom, Modal.Label({ repository, target, query: "", selectedIndex: 0, availableLabels: [], loading: true }))
			yield* GitHubService.use((github) => github.listRepoLabels(repository)).pipe(
				Effect.flatMap((labels) =>
					Effect.gen(function* () {
						const normalized = labels.map((label) => ({ name: label.name, color: label.color ?? null }))
						yield* Atom.update(labelCacheAtom, (current) => ({ ...current, [repository]: normalized }))
						yield* Atom.update(activeModalAtom, (current) =>
							Modal.$is("Label")(current) && current.repository === repository ? Modal.Label({ ...current, availableLabels: normalized, loading: false }) : current,
						)
					}),
				),
				Effect.catch((error) =>
					Effect.gen(function* () {
						yield* Atom.update(activeModalAtom, (current) =>
							Modal.$is("Label")(current) && current.repository === repository ? Modal.Label({ ...current, loading: false }) : current,
						)
						yield* flashErrorEffect(error)
					}),
				),
			)
		}),
	}),

	// === System / system-service commands ===
	defineCommand({
		id: "pull.open-browser",
		title: "Open pull request in browser",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "o",
		keywords: ["github", "web"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* BrowserOpener.use((opener) => opener.openPullRequest(pr)).pipe(Effect.catch(flashErrorEffect))
		}),
	}),
	defineCommand({
		id: "pull.open-editor",
		title: "Open pull request in editor",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "e",
		keywords: ["nvim", "neovim", "editor", "vscode", "code", "diffview", "review", "checkout"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* EditorOpener.use((opener) => opener.openPullRequest(pr)).pipe(Effect.catch(flashErrorEffect))
		}),
	}),
	defineCommand({
		id: "pull.agent-review",
		title: "Run agent review",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		keywords: ["agent", "ai", "claude", "codex", "brief", "risk", "review"],
		shortcut: "b",
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* startAgentReviewEffect(pr, null)
		}),
	}),
	defineCommand({
		id: "pull.agent-review-preset",
		title: "Run agent review with preset…",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "B",
		keywords: ["agent", "ai", "claude", "codex", "brief", "risk", "review", "preset", "picker"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			const config = yield* AgentRunner.use((runner) => runner.config)
			const presets = reviewPresetOptions(config)
			yield* Atom.set(
				activeModalAtom,
				Modal.ReviewPreset({
					...initialReviewPresetModalState,
					presets,
					selectedIndex: Math.max(
						0,
						presets.findIndex((preset) => preset.isDefault),
					),
				}),
			)
		}),
	}),
	defineCommand({
		id: "pull.agent-review-preset-run",
		title: "Run selected review preset",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		keywords: ["agent", "preset"],
		when: reviewPresetModalActiveAtom,
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const modal = yield* Atom.get(activeModalAtom)
			if (!Modal.$is("ReviewPreset")(modal)) return
			const preset = modal.presets[modal.selectedIndex]
			yield* Atom.set(activeModalAtom, Modal.None())
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || !preset) return
			yield* startAgentReviewEffect(pr, preset.id)
		}),
	}),
	defineCommand({
		id: "pull.agent-review-cancel",
		title: "Cancel agent review",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		keywords: ["agent", "ai", "stop", "kill", "brief"],
		disabledReason: agentReviewCancelReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			const cancelled = yield* AgentRunner.use((runner) => runner.cancelReviewFor(pr.repository, pr.number))
			yield* Atom.set(noticeAtom, cancelled ? `Agent review cancelled for #${pr.number}` : "No agent review is running.")
		}),
	}),
	defineCommand({
		id: "pull.copy-metadata",
		title: "Copy pull request metadata",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "y",
		keywords: ["clipboard", "url", "title"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			const text = pullRequestMetadataText(pr)
			yield* Clipboard.use((clipboard) => clipboard.copy(text)).pipe(
				Effect.tap(() => Atom.set(noticeAtom, "Pull request metadata copied")),
				Effect.catch(flashErrorEffect),
			)
		}),
	}),
	defineCommand({
		id: "issue.copy-metadata",
		title: "Copy issue metadata",
		scope: "Comments",
		subtitle: selectedIssueLabelAtom,
		shortcut: "y",
		keywords: ["clipboard", "url", "title"],
		disabledReason: issueSelectedReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue) return
			const text = issueMetadataText(issue)
			yield* Clipboard.use((clipboard) => clipboard.copy(text)).pipe(
				Effect.tap(() => Atom.set(noticeAtom, "Issue metadata copied")),
				Effect.catch(flashErrorEffect),
			)
		}),
	}),
	defineCommand({
		id: "issue.open-browser",
		title: "Open issue in browser",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		shortcut: "o",
		keywords: ["github", "web"],
		disabledReason: issueSelectedReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue) return
			yield* BrowserOpener.use((opener) => opener.openUrl(issue.url)).pipe(Effect.catch(flashErrorEffect))
		}),
	}),

	// === Pull-request lifecycle (hook-bound via handoff) ===
	defineCommand({
		id: "pull.refresh",
		title: pullRequestRefreshTitleAtom,
		scope: "Global",
		subtitle: "Fetch the latest queue from GitHub",
		shortcut: "r",
		disabledReason: pullRequestSurfaceReasonAtom,
		keywords: ["reload", "sync"],
		run: Effect.sync(() => invokeHandoff("refreshPullRequests")),
	}),
	defineCommand({
		id: "issue.refresh",
		title: "Refresh issues",
		scope: "Global",
		subtitle: "Fetch the latest issue queue from GitHub",
		shortcut: "r",
		disabledReason: issueSurfaceReasonAtom,
		keywords: ["reload", "sync"],
		run: Effect.sync(() => invokeHandoff("refreshIssues")),
	}),
	defineCommand({
		id: "pull.load-more",
		title: "Load more pull requests",
		scope: "Navigation",
		subtitle: loadMoreSubtitleAtom,
		disabledReason: loadMoreDisabledReasonAtom,
		keywords: ["next page", "pagination", "more"],
		run: Effect.sync(() => invokeHandoff("loadMorePullRequests")),
	}),
	defineCommand({
		id: "pull.merge",
		title: "Merge pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "m",
		disabledReason: noPullRequestReasonAtom,
		keywords: ["auto merge", "squash"],
		run: Effect.sync(() => invokeHandoff("openMergeModal")),
	}),

	// === Theme / repository pickers ===
	defineCommand({
		id: "theme.open",
		title: "Choose theme",
		scope: "Global",
		subtitle: "Preview and persist a terminal color theme",
		shortcut: "t",
		keywords: ["colors", "appearance"],
		run: Effect.sync(() => invokeHandoff("openThemeModal")),
	}),

	// === Comments / diff entry points (hook-bound) ===
	defineCommand({
		id: "comments.open",
		title: "Open comments",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "c",
		keywords: ["conversation", "discussion", "review"],
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(briefFullViewAtom, false)
			yield* Effect.sync(() => invokeHandoff("openCommentsView"))
		}),
	}),
	defineCommand({
		id: "diff.open",
		title: "Open diff",
		scope: "Diff",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "d",
		disabledReason: noPullRequestReasonAtom,
		keywords: ["files", "patch"],
		run: Effect.gen(function* () {
			yield* Atom.set(diffReturnViewAtom, yield* currentReturnView)
			yield* Atom.set(briefFullViewAtom, false)
			// A plain open starts at the top; only `brief.open-focus` parks a target.
			yield* Atom.set(pendingBriefDiffTargetAtom, null)
			yield* Effect.sync(() => invokeHandoff("openDiffView"))
		}),
	}),

	// === View switches ===
	defineCommand({
		id: "view.repository",
		title: repositoryViewTitleAtom,
		scope: "View",
		subtitle: repositoryViewSubtitleAtom,
		keywords: ["repository", "queue", "view"],
		when: repositoryViewAvailableAtom,
		disabledReason: repositoryViewAlreadyActiveReasonAtom,
		run: Effect.sync(() => invokeHandoff("viewRepository")),
	}),
	defineCommand({
		id: "view.sections",
		title: "Show sections view",
		scope: "View",
		subtitle: sectionsViewSubtitleAtom,
		keywords: ["sections", "inbox", "home", "view"],
		disabledReason: sectionsViewAlreadyActiveReasonAtom,
		run: Effect.sync(() => invokeHandoff("viewSections")),
	}),
	...queueViewCommands,
	defineCommand({
		id: "section.toggle",
		title: "Collapse or expand section",
		scope: "View",
		subtitle: "Toggle the section of the selected pull request",
		shortcut: "z",
		keywords: ["fold", "collapse", "expand", "section"],
		disabledReason: sectionsViewInactiveReasonAtom,
		run: Effect.sync(() => invokeHandoff("toggleSelectedSection")),
	}),
	defineCommand({
		id: "section.toggle-all",
		title: "Collapse or expand all sections",
		scope: "View",
		subtitle: "Collapse every section, or expand all when all are collapsed",
		shortcut: "Z",
		keywords: ["fold", "collapse", "expand", "sections"],
		disabledReason: sectionsViewInactiveReasonAtom,
		run: Effect.sync(() => invokeHandoff("toggleAllSections")),
	}),

	// === Diff cluster ===
	defineCommand({
		id: "diff.reload",
		title: "Reload diff",
		scope: "Diff",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "r",
		disabledReason: diffReloadDisabledReasonAtom,
		keywords: ["refresh", "comments"],
		run: Effect.sync(() => invokeHandoff("reloadDiff")),
	}),
	defineCommand({
		id: "diff.changed-files",
		title: "Open changed files navigator",
		scope: "Diff",
		subtitle: changedFilesSubtitleAtom,
		shortcut: "f",
		disabledReason: changedFilesReasonAtom,
		keywords: ["files", "navigator", "search"],
		run: Effect.sync(() => invokeHandoff("openChangedFilesModal")),
	}),
	defineCommand({
		id: "diff.toggle-file-panel",
		title: "Toggle file panel",
		scope: "Diff",
		shortcut: "shift+f",
		keywords: ["files", "panel", "sidebar", "toggle"],
		run: Effect.sync(() => invokeHandoff("toggleDiffFilePanel")),
	}),
	defineCommand({
		id: "diff.next-file",
		title: "Next diff file",
		scope: "Diff",
		subtitle: diffFileSubtitleAtom,
		shortcut: "]",
		disabledReason: changedFilesReasonAtom,
		run: Effect.sync(() => invokeHandoff("jumpDiffFileNext")),
	}),
	defineCommand({
		id: "diff.previous-file",
		title: "Previous diff file",
		scope: "Diff",
		subtitle: diffFileSubtitleAtom,
		shortcut: "[",
		disabledReason: changedFilesReasonAtom,
		run: Effect.sync(() => invokeHandoff("jumpDiffFilePrevious")),
	}),
	defineCommand({
		id: "diff.open-comment-target",
		title: diffOpenCommentTargetTitleAtom,
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		shortcut: "enter",
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "comment", "thread", "line"],
		run: Effect.sync(() => invokeHandoff("openSelectedDiffComment")),
	}),
	defineCommand({
		id: "diff.toggle-range",
		title: diffToggleRangeTitleAtom,
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		shortcut: "v",
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "comment", "range", "visual"],
		run: Effect.sync(() => invokeHandoff("toggleDiffCommentRange")),
	}),
	defineCommand({
		id: "diff.next-thread",
		title: "Next diff thread",
		scope: "Diff",
		subtitle: diffThreadSubtitleAtom,
		shortcut: "n",
		disabledReason: diffThreadReasonAtom,
		keywords: ["review", "comment", "thread"],
		run: Effect.sync(() => invokeHandoff("moveDiffCommentThreadNext")),
	}),
	defineCommand({
		id: "diff.previous-thread",
		title: "Previous diff thread",
		scope: "Diff",
		subtitle: diffThreadSubtitleAtom,
		shortcut: "p",
		disabledReason: diffThreadReasonAtom,
		keywords: ["review", "comment", "thread"],
		run: Effect.sync(() => invokeHandoff("moveDiffCommentThreadPrevious")),
	}),
	defineCommand({
		id: "diff.add-comment",
		title: "Add comment on selected diff line",
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "reply"],
		run: Effect.sync(() => invokeHandoff("openDiffCommentModal")),
	}),

	// === Comment mutations ===
	defineCommand({
		id: "comments.reply",
		title: "Reply to comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "shift-r",
		disabledReason: selectedCommentReasonAtom,
		keywords: ["respond", "thread"],
		run: Effect.sync(() => invokeHandoff("openReplyToSelectedComment")),
	}),
	defineCommand({
		id: "comments.edit",
		title: "Edit comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "e",
		disabledReason: ownCommentReasonAtom,
		keywords: ["update", "modify", "rewrite"],
		run: Effect.sync(() => invokeHandoff("openEditSelectedComment")),
	}),
	defineCommand({
		id: "comments.delete",
		title: "Delete comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "x",
		disabledReason: ownCommentReasonAtom,
		keywords: ["remove", "destroy"],
		run: Effect.sync(() => invokeHandoff("openDeleteSelectedComment")),
	}),

	defineCommand({
		id: "app.quit",
		title: "Quit prs",
		scope: "System",
		subtitle: "Leave the terminal UI",
		shortcut: "q",
		keywords: ["exit"],
		run: Effect.sync(() => invokeHandoff("quit")),
	}),
]
