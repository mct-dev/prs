// Probe the GitHub search endpoint with the same query the authored-filter
// view would send. If the server returns Kit-only PRs here, the bug is
// somewhere in the atom layer (cache, key collision, stale read). If it
// returns the same broken list, the issue is gh-CLI / authentication.
//
// Run with:   bun run dev/probe-filter.ts [owner/repo]

import { Effect, Layer } from "effect"
import { searchQualifier } from "../src/item.js"
import { type PullRequestView, viewToListInput } from "../src/pullRequestViews.js"
import { CommandRunner } from "../src/services/CommandRunner.js"
import { GitHubService } from "../src/services/GitHubService.js"

const repo = process.argv[2] ?? "anomalyco/opencode"
const view: PullRequestView = { _tag: "Queue", mode: "authored", repository: repo }
const listInput = viewToListInput(view, null, 50)

console.log("=== probe-filter ===")
console.log("repo:        ", repo)
console.log("view:        ", view)
console.log("listInput:   ", listInput)
console.log("searchQuery: ", searchQualifier(listInput))
console.log("---")

const program = Effect.gen(function* () {
	const github = yield* GitHubService
	const user = yield* github.getAuthenticatedUser().pipe(Effect.catch((e) => Effect.succeed(`<error: ${String(e)}>`)))
	console.log("authenticated as:", user)
	const page = yield* github.listPullRequestPage(listInput)
	console.log("---")
	console.log("page item count:", page.items.length)
	console.log("hasNextPage:    ", page.hasNextPage)
	console.log("endCursor:      ", page.endCursor)
	console.log("---")
	const byAuthor = new Map<string, number>()
	for (const pr of page.items) {
		byAuthor.set(pr.author, (byAuthor.get(pr.author) ?? 0) + 1)
	}
	console.log("authors in result:")
	for (const [author, count] of [...byAuthor.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(` - ${author}: ${count}`)
	}
	console.log("---")
	console.log("first 10:")
	for (const pr of page.items.slice(0, 10)) {
		console.log(` - #${pr.number} by ${pr.author}: ${pr.title}`)
	}
})

const layer = GitHubService.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))

await Effect.runPromise(program.pipe(Effect.provide(layer))).catch((e) => {
	console.error("FAILED:", e)
	process.exit(1)
})
