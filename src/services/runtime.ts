import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { config } from "../config.js"
import { detectCurrentGitHubRepository } from "../gitRemotes.js"
import { Observability } from "../observability.js"
import { initialPullRequestView, type PullRequestView, sectionsView } from "../pullRequestViews.js"
import { AgentRunner } from "./AgentRunner.js"
import { BrowserOpener } from "./BrowserOpener.js"
import { CacheService } from "./CacheService.js"
import { Clipboard } from "./Clipboard.js"
import { EditorOpener } from "./EditorOpener.js"
import { CommandRunner } from "./CommandRunner.js"
import { GitHubService } from "./GitHubService.js"

const parseOptionalPositiveInt = (value: string | undefined, fallback: number | null) => {
	if (value === undefined) return fallback
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const mockPrCount = parseOptionalPositiveInt(process.env.GHUI_MOCK_PR_COUNT, null)
export const mockRepository = process.env.GHUI_MOCK_REPOSITORY?.trim() || null
export const detectedRepository = mockPrCount === null ? detectCurrentGitHubRepository() : mockRepository
// Home view: sections outside a git repo, the authored queue inside one.
// Mock mode keeps the queue so fixtures stay stable. `PRS_DEFAULT_VIEW`
// (`sections` or `queue`) overrides either way.
export const homePullRequestView: PullRequestView = (() => {
	const override = process.env.PRS_DEFAULT_VIEW?.trim().toLowerCase()
	if (override === "sections") return sectionsView
	if (override === "queue") return initialPullRequestView(null)
	return mockPrCount === null && detectedRepository === null ? sectionsView : initialPullRequestView(null)
})()
export const mockUsername = process.env.GHUI_MOCK_USERNAME?.trim() || (mockPrCount !== null ? "kitlangton" : undefined)

export const mockWorkspacePreferencesPath = (() => {
	if (mockPrCount === null) return null
	const value = process.env.GHUI_MOCK_WORKSPACE_PREFERENCES_PATH?.trim()
	if (value === "off" || value === "0" || value === "false") return null
	return value && value.length > 0 ? value : ".ghui/mock-workspace-preferences.json"
})()

export const mockRepositoryCatalog =
	mockPrCount === null || !mockRepository
		? []
		: [
				{ repository: mockRepository ?? "anomalyco/opencode", pullRequestCount: 0, issueCount: 0, description: "OpenCode project workspace" },
				{ repository: "kitlangton/ghui", pullRequestCount: 7, issueCount: 4, description: "Terminal UI for GitHub pull requests" },
				{ repository: "kitlangton/homebrew-tap", pullRequestCount: 0, issueCount: 0, description: "Homebrew formula automation" },
				{ repository: "Effect-TS/effect", pullRequestCount: 31, issueCount: 9, description: "Effect TypeScript runtime and libraries" },
			]

export const initialRecentRepositories = mockRepositoryCatalog.length > 0 ? mockRepositoryCatalog.map((repo) => repo.repository) : detectedRepository ? [detectedRepository] : []

export const pullRequestPageSize = Math.min(100, parseOptionalPositiveInt(process.env.GHUI_PR_PAGE_SIZE, config.prPageSize) ?? config.prPageSize)

const githubServiceLayer =
	mockPrCount !== null
		? (await import("./MockGitHubService.js")).MockGitHubService.layer({
				prCount: mockPrCount,
				repoCount: parseOptionalPositiveInt(process.env.GHUI_MOCK_REPO_COUNT, 4) ?? 4,
				repository: mockRepository,
				repositories: mockRepositoryCatalog.map((repo) => repo.repository),
				...(mockUsername ? { username: mockUsername } : {}),
			})
		: GitHubService.layerNoDeps

const cacheServiceLayer = mockPrCount !== null ? CacheService.disabledLayer : CacheService.layerFromPath(config.cachePath)

const editorOpenerLayer = mockPrCount !== null ? EditorOpener.mockLayer : EditorOpener.layerNoDeps

const agentRunnerLayer = AgentRunner.layer.pipe(Layer.provide(cacheServiceLayer))

export const githubRuntime = Atom.runtime(
	Layer.mergeAll(githubServiceLayer, cacheServiceLayer, Clipboard.layerNoDeps, BrowserOpener.layerNoDeps, editorOpenerLayer, agentRunnerLayer).pipe(
		Layer.provide(CommandRunner.layer),
		Layer.provideMerge(Observability.layer),
	),
)
