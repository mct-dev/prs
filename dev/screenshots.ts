// Renders each view of the app in mock mode and writes docs/screenshots/*.svg.
//
//   bun run screenshots            # all views
//   bun run screenshots diff brief # some views
//
// Every view runs in its own `bun` subprocess with a throwaway HOME, config
// and cache, so nothing touches ~/.config/prs or ~/.cache/prs. The data is a
// synthetic fixture (my-org/*, made-up people). A few mock-only tweaks are
// patched in at load time, in the subprocess only; src/ is not changed.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PullRequestComment, PullRequestItem, PullRequestReviewer } from "../src/domain.ts"
import type { RiskBrief } from "../src/review/briefSchema.ts"
import type { AgentReviewRecord } from "../src/review/types.ts"
import type { MockFixtureSnapshot } from "../src/services/mockFixtures.ts"

const COLS = 140
const ROWS = 36
const THEME = "tokyo-night"
const VIEWER = "alice"
const repoRoot = new URL("..", import.meta.url).pathname
const outDir = join(repoRoot, "docs", "screenshots")

// ---------------------------------------------------------------------------
// Views

type Step = { readonly key: string; readonly ctrl?: boolean } | { readonly type: string }

interface View {
	readonly name: string
	readonly steps: readonly Step[]
	/** The frame is complete once this holds (and the frame stops changing). */
	readonly ready: (frame: string) => boolean
}

// Braille spinner frames: something is still loading.
const spinner = /[\u2800-\u28FF]/

const hasFooter = (frame: string) => /ctrl-p|esc /.test(frame.split("\n").slice(-3).join("\n"))

const views: readonly View[] = [
	{ name: "sections", steps: [], ready: (f) => f.includes("Needs my review") && f.includes("ctrl-p") },
	{ name: "details", steps: [{ key: "return" }], ready: (f) => f.includes("Retry failed webhook deliveries") && f.includes("Summary") && hasFooter(f) },
	{ name: "diff", steps: [{ key: "d" }], ready: (f) => f.includes("deliver.ts") && f.includes("backoff") && hasFooter(f) },
	{ name: "comments", steps: [{ key: "c" }], ready: (f) => f.includes("nina") && f.includes("409") && hasFooter(f) },
	{ name: "brief", steps: [{ key: "v" }], ready: (f) => f.includes("Double delivery") && hasFooter(f) },
	{ name: "filter", steps: [{ type: "/ci:" }], ready: (f) => f.includes("ci:") && /pass/.test(f) },
	{ name: "merge", steps: [{ key: "m" }], ready: (f) => /squash/i.test(f) },
	{ name: "runs", steps: [{ key: "a" }], ready: (f) => f.includes("CI") && f.includes("Lint") && hasFooter(f) },
	{ name: "palette", steps: [{ key: "p", ctrl: true }], ready: (f) => /command/i.test(f) && f.includes("Edit sections config") },
]

// ---------------------------------------------------------------------------
// Synthetic data

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)
const sha = (number: number) => `c0ffee${number.toString(16).padStart(10, "0")}`

const user = (login: string, state: PullRequestReviewer["state"], extra: Partial<PullRequestReviewer> = {}): PullRequestReviewer => ({
	kind: "user",
	login,
	state,
	codeOwner: false,
	isViewer: login === VIEWER,
	...extra,
})
const team = (login: string, codeOwner = true): PullRequestReviewer => ({ kind: "team", login, state: "requested", codeOwner, isViewer: false })

const checks = (names: readonly string[], failing: readonly string[] = [], pending: readonly string[] = []) => {
	const items = names.map((name) =>
		pending.includes(name)
			? { name, status: "in_progress" as const, conclusion: null }
			: { name, status: "completed" as const, conclusion: failing.includes(name) ? ("failure" as const) : ("success" as const) },
	)
	const passed = items.filter((item) => item.conclusion === "success").length
	const checkStatus = failing.length > 0 ? ("failing" as const) : pending.length > 0 ? ("pending" as const) : ("passing" as const)
	return { checks: items, checkStatus, checkSummary: `${passed}/${items.length}` }
}
const standardChecks = ["build", "test", "lint", "typecheck", "e2e", "coverage", "security", "preview", "size"]

const heroDiff = `diff --git a/src/webhooks/deliver.ts b/src/webhooks/deliver.ts
--- a/src/webhooks/deliver.ts
+++ b/src/webhooks/deliver.ts
@@ -1,12 +1,30 @@
 import { db } from "../db"
 import { sign } from "./sign"
+import { backoff } from "./backoff"
${" "}
-export async function deliver(event: WebhookEvent, endpoint: Endpoint) {
-  const body = JSON.stringify(event.payload)
-  const response = await fetch(endpoint.url, {
-    method: "POST",
-    headers: { "content-type": "application/json", "x-signature": sign(body, endpoint.secret) },
-    body,
-  })
-  if (!response.ok) logger.warn("webhook failed", { endpoint: endpoint.id, status: response.status })
+const MAX_ATTEMPTS = 5
+
+export async function deliver(event: WebhookEvent, endpoint: Endpoint) {
+  const body = JSON.stringify(event.payload)
+  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
+    const response = await fetch(endpoint.url, {
+      method: "POST",
+      headers: {
+        "content-type": "application/json",
+        "x-signature": sign(body, endpoint.secret),
+        "x-delivery-attempt": String(attempt),
+      },
+      body,
+    })
+    await db.deliveryAttempts.insert({ deliveryId: event.id, attempt, status: response.status })
+    if (response.ok) return { ok: true, attempts: attempt }
+    if (!isRetryable(response.status)) break
+    await sleep(backoff(attempt))
+  }
+  await db.deliveries.markDead(event.id)
+  return { ok: false, attempts: MAX_ATTEMPTS }
 }
+
+const isRetryable = (status: number) => status === 409 || status === 429 || status >= 500
+
+const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
diff --git a/src/webhooks/backoff.ts b/src/webhooks/backoff.ts
new file mode 100644
--- /dev/null
+++ b/src/webhooks/backoff.ts
@@ -0,0 +1,8 @@
+const BASE_MS = 2_000
+const CAP_SECONDS = 300
+
+/** Exponential backoff with full jitter: 2s, 4s, 8s ... capped at 5 minutes. */
+export function backoff(attempt: number) {
+  const ceiling = Math.min(CAP_SECONDS, BASE_MS * 2 ** (attempt - 1))
+  return Math.round(Math.random() * ceiling)
+}
diff --git a/migrations/0042_delivery_attempts.sql b/migrations/0042_delivery_attempts.sql
new file mode 100644
--- /dev/null
+++ b/migrations/0042_delivery_attempts.sql
@@ -0,0 +1,7 @@
+CREATE TABLE delivery_attempts (
+  delivery_id uuid NOT NULL REFERENCES deliveries(id),
+  attempt smallint NOT NULL,
+  status smallint NOT NULL,
+  created_at timestamptz NOT NULL DEFAULT now(),
+  PRIMARY KEY (delivery_id, attempt)
+);
`

const smallDiff = (file: string, before: string, after: string) => `diff --git a/${file} b/${file}
--- a/${file}
+++ b/${file}
@@ -10,3 +10,3 @@
 // ${file}
-${before}
+${after}
 export {}
`

const heroBody = `## Summary

Webhook deliveries used to be one-shot: a timeout or a 5xx dropped the event. This retries up to 5 times with exponential backoff and jitter, and records every attempt.

## Changes

- \`deliver()\` retries on 409, 429 and 5xx
- new \`backoff()\` helper (full jitter, capped)
- \`delivery_attempts\` table for the dashboard

## Testing

- unit tests for the retry loop and backoff
- ran against a flaky endpoint on staging for an hour`

const heroComments: readonly PullRequestComment[] = [
	{
		_tag: "comment",
		id: "c1",
		author: "nina",
		body: "Nice. Can we cap total retry time too, so a dead endpoint doesn't hold a worker for 15 minutes?",
		createdAt: minutesAgo(95),
		url: null,
	},
	{
		_tag: "review-comment",
		id: "r1",
		author: "mira",
		body: "Retrying on `409` worries me. Some receivers return 409 for *already processed*, so we'd re-send an event they handled.",
		createdAt: minutesAgo(70),
		url: null,
		path: "src/webhooks/deliver.ts",
		line: 30,
		side: "RIGHT",
		inReplyTo: null,
	},
	{
		_tag: "review-comment",
		id: "r2",
		author: "devon",
		body: "Good point. I'll treat 409 as delivered and add a test for it.",
		createdAt: minutesAgo(52),
		url: null,
		path: "src/webhooks/deliver.ts",
		line: 30,
		side: "RIGHT",
		inReplyTo: "r1",
	},
	{
		_tag: "review-comment",
		id: "r3",
		author: "tess",
		body: "`CAP_SECONDS` is seconds but `BASE_MS` is ms, so the cap is 300ms, not 5 minutes.",
		createdAt: minutesAgo(30),
		url: null,
		path: "src/webhooks/backoff.ts",
		line: 6,
		side: "RIGHT",
		inReplyTo: null,
	},
	{
		_tag: "comment",
		id: "c2",
		author: "ci-bot",
		authorIsBot: true,
		body: "Coverage: **91.4%** (+0.6%) · 3 files changed",
		createdAt: minutesAgo(14),
		url: null,
	},
]

interface PrSpec {
	readonly repository: string
	readonly number: number
	readonly author: string
	readonly title: string
	readonly branch: string
	readonly review: PullRequestItem["reviewStatus"]
	readonly updated: number
	readonly created: number
	readonly size: readonly [additions: number, deletions: number, files: number]
	readonly labels?: readonly [string, string][]
	readonly checks: Pick<PullRequestItem, "checks" | "checkStatus" | "checkSummary">
	readonly reviewers: readonly PullRequestReviewer[]
	readonly body?: string
	readonly diff?: string
	readonly comments?: readonly PullRequestComment[]
	readonly autoMerge?: boolean
	readonly viewerReviewedOld?: boolean
}

const prSpecs: readonly PrSpec[] = [
	{
		repository: "my-org/api",
		number: 482,
		author: "devon",
		title: "Retry failed webhook deliveries with backoff",
		branch: "devon/webhook-retries",
		review: "review",
		updated: 12,
		created: 60 * 26,
		size: [35, 2, 3],
		labels: [["enhancement", "a2eeef"]],
		checks: checks(standardChecks),
		reviewers: [user(VIEWER, "requested"), user("mira", "commented"), user("tess", "commented"), team("my-org/backend")],
		body: heroBody,
		diff: heroDiff,
		comments: heroComments,
	},
	{
		repository: "my-org/web",
		number: 1291,
		author: "nina",
		title: "Virtualize the invoice table",
		branch: "nina/virtual-invoices",
		review: "review",
		updated: 60 * 26,
		created: 60 * 50,
		size: [240, 118, 9],
		labels: [["performance", "fbca04"]],
		checks: checks(standardChecks, [], ["e2e"]),
		reviewers: [user(VIEWER, "requested"), team("my-org/frontend")],
	},
	{
		repository: "my-org/infra",
		number: 77,
		author: "oscar",
		title: "Move staging to the new VPC",
		branch: "oscar/staging-vpc",
		review: "review",
		updated: 60 * 50,
		created: 60 * 24 * 4,
		size: [412, 230, 14],
		labels: [["infra", "c5def5"]],
		checks: checks(standardChecks.slice(0, 8), ["e2e"]),
		reviewers: [user(VIEWER, "requested"), user("kai", "requested")],
	},
	{
		repository: "my-org/billing",
		number: 503,
		author: "tess",
		title: "Round tax per line item, not per invoice",
		branch: "tess/line-item-tax",
		review: "review",
		updated: 60 * 24 * 3,
		created: 60 * 24 * 4,
		size: [64, 21, 3],
		labels: [["bug", "d73a4a"]],
		checks: checks(standardChecks),
		reviewers: [user(VIEWER, "requested"), team("my-org/billing")],
	},
	{
		repository: "my-org/web",
		number: 1287,
		author: "kai",
		title: "Add dark mode color tokens",
		branch: "kai/dark-tokens",
		review: "approved",
		updated: 25,
		created: 60 * 24 * 3,
		size: [96, 30, 5],
		labels: [["ui", "c5def5"]],
		checks: checks(standardChecks),
		reviewers: [user(VIEWER, "approved"), user("nina", "approved")],
		viewerReviewedOld: true,
	},
	{
		repository: "my-org/api",
		number: 489,
		author: "mira",
		title: "Rate limit requests per API key",
		branch: "mira/per-key-limits",
		review: "changes",
		updated: 60 * 28,
		created: 60 * 24 * 5,
		size: [150, 12, 4],
		checks: checks(standardChecks),
		reviewers: [user(VIEWER, "changes"), user("devon", "approved")],
		viewerReviewedOld: true,
	},
	{
		repository: "my-org/infra",
		number: 88,
		author: "buster",
		title: "Pin Terraform provider versions",
		branch: "buster/pin-providers",
		review: "none",
		updated: 60 * 24 * 2,
		created: 60 * 24 * 6,
		size: [18, 18, 2],
		checks: checks(standardChecks.slice(0, 4)),
		reviewers: [team("my-org/platform")],
	},
	{
		repository: "my-org/web",
		number: 1302,
		author: "kai",
		title: "New onboarding checklist",
		branch: "kai/onboarding",
		review: "draft",
		updated: 60 * 24 * 4,
		created: 60 * 24 * 5,
		size: [520, 40, 17],
		checks: checks(standardChecks, [], ["e2e", "preview"]),
		reviewers: [],
	},
	{
		repository: "my-org/api",
		number: 495,
		author: VIEWER,
		title: "Add request IDs to structured logs",
		branch: "alice/request-ids",
		review: "approved",
		updated: 45,
		created: 60 * 24 * 2,
		size: [72, 9, 5],
		checks: checks(standardChecks),
		reviewers: [user("devon", "approved"), team("my-org/backend")],
		autoMerge: true,
	},
	{
		repository: "my-org/web",
		number: 1296,
		author: VIEWER,
		title: "Fix focus trap in the settings modal",
		branch: "alice/focus-trap",
		review: "review",
		updated: 60 * 27,
		created: 60 * 30,
		size: [23, 7, 2],
		labels: [["bug", "d73a4a"]],
		checks: checks(standardChecks, ["e2e"]),
		reviewers: [user("nina", "requested")],
	},
	{
		repository: "my-org/api",
		number: 512,
		author: "app/dependabot",
		title: "Bump zod from 3.23.8 to 3.24.1",
		branch: "dependabot/npm_and_yarn/zod-3.24.1",
		review: "review",
		updated: 60 * 24 * 3,
		created: 60 * 24 * 4,
		size: [6, 6, 2],
		labels: [["dependencies", "0366d6"]],
		checks: checks(standardChecks),
		reviewers: [user(VIEWER, "requested")],
	},
]

const buildFixture = (): MockFixtureSnapshot => ({
	repository: "my-org/api",
	generatedAt: new Date().toISOString(),
	issues: [],
	pullRequests: prSpecs.map((spec) => ({
		repository: spec.repository,
		author: spec.author,
		headRefOid: sha(spec.number),
		headRefName: spec.branch,
		baseRefName: "main",
		defaultBranchName: "main",
		number: spec.number,
		title: spec.title,
		body: spec.body ?? `${spec.title}.`,
		labels: (spec.labels ?? []).map(([name, color]) => ({ name, color: `#${color}` })),
		additions: spec.size[0],
		deletions: spec.size[1],
		changedFiles: spec.size[2],
		state: "open",
		reviewStatus: spec.review,
		...spec.checks,
		autoMergeEnabled: spec.autoMerge ?? false,
		detailLoaded: true,
		createdAt: minutesAgo(spec.created),
		updatedAt: minutesAgo(spec.updated),
		closedAt: null,
		url: `https://github.com/${spec.repository}/pull/${spec.number}`,
		reviewers: { reviewers: spec.reviewers, requiredApprovals: 1 },
		diff: spec.diff ?? smallDiff("src/index.ts", "const enabled = false", "const enabled = true"),
		comments: spec.comments ?? [],
		reviewComments: (spec.comments ?? []).flatMap(({ _tag, ...comment }) => (_tag === "review-comment" && "path" in comment ? [comment] : [])),
	})),
})

const briefs: Record<number, RiskBrief> = {
	482: {
		risk: "medium",
		summary: "Retries failed webhook deliveries up to 5 times with backoff and jitter, and logs every attempt to a new table.",
		before_after: "Before: one attempt, failures dropped. After: up to 5 attempts; the last failure marks the delivery dead.",
		focus_areas: [
			{ file: "src/webhooks/deliver.ts", lines: "30-31", why: "Double delivery: 409 is retried, but many receivers use 409 for 'already processed'.", severity: "high" },
			{ file: "src/webhooks/backoff.ts", lines: "1-7", why: "Unit mix-up: CAP_SECONDS is compared to milliseconds, so the cap is 300ms.", severity: "medium" },
			{ file: "migrations/0042_delivery_attempts.sql", lines: null, why: "New table on a hot path; one insert per attempt.", severity: "low" },
		],
		safe_to_skip: [
			{ path: "test/webhooks/*.test.ts", why: "New tests only." },
			{ path: "docs/webhooks.md", why: "Docs." },
		],
		questions: ["Should 409 count as delivered?", "Is 5 attempts right for slow receivers?"],
		tests: "Retry loop and backoff are tested. The 409 path is not.",
		confidence: "medium",
	},
	1291: {
		risk: "low",
		summary: "Renders only visible invoice rows.",
		focus_areas: [{ file: "src/invoices/Table.tsx", lines: "20-60", why: "Row height is fixed.", severity: "low" }],
		safe_to_skip: [],
		questions: [],
		confidence: "high",
	},
	77: {
		risk: "high",
		summary: "Moves staging networking to a new VPC.",
		focus_areas: [{ file: "infra/staging/vpc.tf", lines: null, why: "Replaces the NAT gateway.", severity: "high" }],
		safe_to_skip: [],
		questions: [],
		confidence: "medium",
	},
	503: {
		risk: "high",
		summary: "Changes tax rounding.",
		focus_areas: [{ file: "src/tax/round.ts", lines: "1-30", why: "Totals change for existing invoices.", severity: "high" }],
		safe_to_skip: [],
		questions: [],
		confidence: "high",
	},
	1287: {
		risk: "low",
		summary: "Adds color tokens.",
		focus_areas: [],
		safe_to_skip: [{ path: "src/theme/tokens.ts", why: "Values only." }],
		questions: [],
		confidence: "high",
	},
}

const buildReviews = (): readonly AgentReviewRecord[] =>
	prSpecs.flatMap((spec) => {
		const brief = briefs[spec.number]
		if (!brief) return []
		return [
			{
				id: `review-${spec.number}`,
				repository: spec.repository,
				number: spec.number,
				headSha: sha(spec.number),
				preset: "default",
				agent: "claude",
				status: "done",
				mode: "worktree",
				briefJson: JSON.stringify(brief),
				error: null,
				logPath: null,
				costUsd: 0.21,
				startedAt: minutesAgo(spec.updated - 2),
				finishedAt: minutesAgo(spec.updated - 4),
			} satisfies AgentReviewRecord,
		]
	})

// ---------------------------------------------------------------------------
// Child: render one view and print the captured frame as JSON

interface Cell {
	readonly text: string
	readonly fg: string | null
	readonly bg: string | null
	readonly attributes: number
	readonly width: number
}
interface Frame {
	readonly chars: string
	readonly background: string
	readonly lines: readonly (readonly Cell[])[]
}

const patchSource = (source: string, file: string, from: string, to: string) => {
	if (!source.includes(from)) throw new Error(`screenshots: ${file} changed; update the patch for ${JSON.stringify(from)}`)
	return source.replace(from, to)
}

const installMockPatches = () => {
	Bun.plugin({
		name: "prs-screenshot-mock",
		setup(build) {
			// Seed finished agent reviews (mock mode has no cache).
			build.onLoad({ filter: /src\/services\/CacheService\.ts$/ }, async (args) => ({
				loader: "ts",
				contents: patchSource(
					await Bun.file(args.path).text(),
					"CacheService.ts",
					"readLatestAgentReviews: () => Effect.succeed([]),",
					"readLatestAgentReviews: () => Effect.succeed(globalThis.__prsScreenshotReviews ?? []),",
				),
			}))
			// The fixture loader revives createdAt but not updatedAt.
			build.onLoad({ filter: /src\/services\/mockFixtures\.ts$/ }, async (args) => ({
				loader: "ts",
				contents: patchSource(
					await Bun.file(args.path).text(),
					"mockFixtures.ts",
					"createdAt: asDate(pullRequest.createdAt),",
					"createdAt: asDate(pullRequest.createdAt),\n\t\t\tupdatedAt: asDate(pullRequest.updatedAt),",
				),
			}))
			// Show only the fixture's pull requests, not generated extras.
			build.onLoad({ filter: /src\/services\/MockGitHubService\.ts$/ }, async (args) => ({
				loader: "ts",
				contents: patchSource(await Bun.file(args.path).text(), "MockGitHubService.ts", "prCount: Math.max(8, Math.min(24, Math.ceil(options.prCount / 8))),", "prCount: 0,"),
			}))
		},
	})
}

const toHex = (color: { toInts(): [number, number, number, number] } | null | undefined) => {
	if (!color) return null
	const [r, g, b, a] = color.toInts()
	if (a === 0) return null
	return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`
}

const runChild = async (view: View) => {
	installMockPatches()
	const reviews = buildReviews()
	Object.assign(globalThis, { __prsScreenshotReviews: reviews, IS_REACT_ACT_ENVIRONMENT: true })
	const { act, createElement } = await import("react")
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("../src/App.tsx")
	const setup = await createTestRenderer({ width: COLS, height: ROWS })
	const root = createRoot(setup.renderer)
	const tick = async () => {
		await act(async () => {
			await setup.renderOnce()
			await new Promise((resolve) => setTimeout(resolve, 5))
		})
	}
	const settle = async (ready: (frame: string) => boolean, label: string) => {
		let last = ""
		let stable = 0
		for (let index = 0; index < 1500; index++) {
			await tick()
			const frame = setup.captureCharFrame()
			stable = frame === last ? stable + 1 : 0
			last = frame
			if (stable >= 10 && !spinner.test(frame) && ready(frame)) return
		}
		throw new Error(`screenshots: "${label}" never settled. Last frame:\n${last}`)
	}
	act(() => root.render(createElement(RegistryProvider, null, createElement(App))))
	await settle(views[0]!.ready, "startup")
	for (const step of view.steps) {
		if ("type" in step) for (const char of step.type) act(() => setup.mockInput.pressKey(char))
		else if (step.key === "return") act(() => setup.mockInput.pressEnter())
		else act(() => setup.mockInput.pressKey(step.key, step.ctrl ? { ctrl: true } : undefined))
		for (let index = 0; index < 6; index++) await tick()
	}
	await settle(view.ready, view.name)

	const captured = setup.captureSpans()
	const counts = new Map<string, number>()
	const lines = captured.lines.map((line) =>
		line.spans.map((span): Cell => {
			const cell = { text: span.text, fg: toHex(span.fg), bg: toHex(span.bg), attributes: span.attributes & 255, width: span.width }
			if (cell.bg) counts.set(cell.bg, (counts.get(cell.bg) ?? 0) + cell.width)
			return cell
		}),
	)
	const background = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "#1a1b26"
	const frame: Frame = { chars: setup.captureCharFrame(), background, lines }
	console.log(JSON.stringify(frame))
	act(() => root.unmount())
	setup.renderer.destroy()
	process.exit(0)
}

// ---------------------------------------------------------------------------
// SVG

const CELL_W = 8.4
const CELL_H = 18
const FONT_SIZE = 14
const PAD = 16
const BAR = 30
const BOLD = 1
const DIM = 2
const ITALIC = 4
const UNDERLINE = 8
const INVERSE = 32
const STRIKE = 128

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export const frameToSvg = (frame: Frame, title: string) => {
	const width = Math.round(COLS * CELL_W + PAD * 2)
	const height = Math.round(ROWS * CELL_H + PAD * 2 + BAR)
	const fallbackFg = "#c0caf5"
	const rects: string[] = []
	const texts: string[] = []
	frame.lines.forEach((line, row) => {
		const y = BAR + PAD + row * CELL_H
		let col = 0
		let run: { start: number; cells: number; color: string } | null = null
		const flush = () => {
			if (run && run.color !== frame.background)
				rects.push(`<rect x="${(PAD + run.start * CELL_W).toFixed(1)}" y="${y}" width="${(run.cells * CELL_W).toFixed(1)}" height="${CELL_H}" fill="${run.color}"/>`)
			run = null
		}
		for (const span of line) {
			const inverse = (span.attributes & INVERSE) !== 0
			const fg = (inverse ? span.bg : span.fg) ?? (inverse ? frame.background : fallbackFg)
			const bg = (inverse ? (span.fg ?? fallbackFg) : span.bg) ?? frame.background
			if (run && run.color === bg) run.cells += span.width
			else {
				flush()
				run = { start: col, cells: span.width, color: bg }
			}
			// One <text> per run of visible text, placed at its own column. Runs split at
			// 2+ spaces so gaps never depend on how a viewer handles whitespace, and
			// textLength (spacing only) keeps every run on the cell grid.
			let offset = 0
			for (const part of span.text.split(/( {2,})/)) {
				const cells = Bun.stringWidth(part)
				const text = part.trimEnd()
				const lead = text.length - text.trimStart().length
				const visible = text.trimStart()
				if (visible.length > 0) {
					const x = PAD + (col + offset + lead) * CELL_W
					const attrs = [`x="${x.toFixed(1)}"`, `y="${y + 13}"`, `fill="${fg}"`]
					if (span.attributes & BOLD) attrs.push(`font-weight="bold"`)
					if (span.attributes & ITALIC) attrs.push(`font-style="italic"`)
					if (span.attributes & DIM) attrs.push(`opacity="0.6"`)
					const decorations = [span.attributes & UNDERLINE ? "underline" : "", span.attributes & STRIKE ? "line-through" : ""].filter(Boolean)
					if (decorations.length > 0) attrs.push(`text-decoration="${decorations.join(" ")}"`)
					const visibleCells = Bun.stringWidth(visible)
					if (visibleCells > 1) attrs.push(`textLength="${(visibleCells * CELL_W).toFixed(1)}" lengthAdjust="spacing"`)
					texts.push(`<text ${attrs.join(" ")}>${escapeXml(visible)}</text>`)
				}
				offset += cells
			}
			col += span.width
		}
		flush()
	})
	const dots = ["#ff5f57", "#febc2e", "#28c840"].map((color, index) => `<circle cx="${PAD + 6 + index * 20}" cy="${BAR / 2 + 2}" r="6" fill="${color}"/>`).join("")
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
		`<title>${escapeXml(title)}</title>`,
		`<rect width="${width}" height="${height}" rx="10" fill="${frame.background}"/>`,
		dots,
		`<g shape-rendering="crispEdges">${rects.join("")}</g>`,
		`<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace" font-size="${FONT_SIZE}" style="white-space:pre" xml:space="preserve">${texts.join("")}</g>`,
		`</svg>`,
		"",
	].join("\n")
}

// ---------------------------------------------------------------------------
// Parent: one subprocess per view

const titles: Record<string, string> = {
	sections: "prs: sections list",
	details: "prs: pull request details",
	diff: "prs: diff view",
	comments: "prs: comments view",
	brief: "prs: agent review brief",
	filter: "prs: filter with suggestions",
	merge: "prs: merge dialog",
	runs: "prs: workflow runs",
	palette: "prs: command palette",
}

const childEnv = (temp: string) => {
	const env: Record<string, string> = {}
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined || /^(PRS_|GHUI_|XDG_)/.test(key) || key === "FORCE_COLOR") continue
		env[key] = value
	}
	return {
		...env,
		HOME: join(temp, "home"),
		XDG_CONFIG_HOME: join(temp, "xdg-config"),
		XDG_CACHE_HOME: join(temp, "xdg-cache"),
		PRS_CONFIG_DIR: join(temp, "config"),
		PRS_CACHE_PATH: "off",
		PRS_SECTIONS_PATH: join(temp, "none", "sections.yaml"),
		PRS_MOCK_PR_COUNT: String(prSpecs.length),
		PRS_MOCK_FIXTURE_PATH: join(temp, "fixture.json"),
		PRS_MOCK_WORKSPACE_PREFERENCES_PATH: "off",
		PRS_MOCK_USERNAME: VIEWER,
		NO_COLOR: "1",
	}
}

// Nerd Font / private-use glyphs render as boxes on GitHub.
const privateUse = /[-]|[\u{F0000}-\u{10FFFF}]/u

const runParent = async (names: readonly string[]) => {
	const selected = names.length > 0 ? views.filter((view) => names.includes(view.name)) : views
	const temp = mkdtempSync(join(tmpdir(), "prs-screenshots-"))
	try {
		mkdirSync(join(temp, "config"), { recursive: true })
		mkdirSync(join(temp, "home"), { recursive: true })
		writeFileSync(join(temp, "config", "config.json"), JSON.stringify({ theme: THEME }))
		writeFileSync(join(temp, "fixture.json"), JSON.stringify(buildFixture()))
		mkdirSync(outDir, { recursive: true })
		const env = childEnv(temp)
		await Promise.all(
			selected.map(async (view) => {
				const child = Bun.spawn(["bun", import.meta.path, "--child", view.name], { cwd: repoRoot, env, stdout: "pipe", stderr: "pipe", timeout: 120_000 })
				const [stdout, stderr, code] = await Promise.all([Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr), child.exited])
				if (code !== 0) throw new Error(`screenshots: ${view.name} failed (exit ${code}):\n${stderr}`)
				const frame = JSON.parse(stdout.trim().split("\n").at(-1)!) as Frame
				if (privateUse.test(frame.chars)) console.warn(`screenshots: ${view.name} has private-use glyphs`)
				const path = join(outDir, `${view.name}.svg`)
				writeFileSync(path, frameToSvg(frame, titles[view.name] ?? `prs: ${view.name}`))
				if (process.env.SCREENSHOTS_PRINT) console.log(`\n=== ${view.name}\n${frame.chars}`)
				console.log(`wrote ${path}`)
			}),
		)
	} finally {
		rmSync(temp, { recursive: true, force: true })
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	if (args[0] === "--child") {
		const view = views.find((candidate) => candidate.name === args[1])
		if (!view) throw new Error(`screenshots: unknown view ${args[1]}`)
		await runChild(view).catch((error: unknown) => {
			console.error(error)
			process.exit(1)
		})
	} else {
		await runParent(args)
	}
}
