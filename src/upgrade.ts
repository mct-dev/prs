import { existsSync } from "node:fs"
import { join } from "node:path"

// `prs upgrade` is not published to npm, so there is no package to install.
// When prs runs from a clean git checkout that tracks an upstream branch, we
// fast-forward it. In every other case we only print instructions: nothing
// here ever resets, stashes, or discards local work.

export interface GitResult {
	readonly status: number
	readonly stdout: string
}

/** Runs `git -C <repoRoot> ...args` and captures its output. */
export type GitProbe = (args: readonly string[]) => GitResult

export type UpgradePlan = { readonly _tag: "Pull"; readonly repoRoot: string } | { readonly _tag: "Instructions"; readonly reason: string; readonly repoRoot: string | null }

export const planUpgrade = ({ repoRoot, isCheckout, git }: { readonly repoRoot: string; readonly isCheckout: boolean; readonly git: GitProbe }): UpgradePlan => {
	if (!isCheckout) return { _tag: "Instructions", reason: "prs is not running from a git checkout.", repoRoot: null }

	const status = git(["status", "--porcelain", "--untracked-files=no"])
	if (status.status !== 0) return { _tag: "Instructions", reason: "Could not read the checkout's git status.", repoRoot }
	if (status.stdout.trim().length > 0) return { _tag: "Instructions", reason: "The checkout has uncommitted changes. Commit or stash them first.", repoRoot }

	if (git(["symbolic-ref", "-q", "--short", "HEAD"]).status !== 0) return { _tag: "Instructions", reason: "The checkout is not on a branch.", repoRoot }

	if (git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).status !== 0) {
		return { _tag: "Instructions", reason: "The current branch has no upstream branch.", repoRoot }
	}

	return { _tag: "Pull", repoRoot }
}

export const upgradeInstructions = (plan: Extract<UpgradePlan, { _tag: "Instructions" }>) => {
	const location = plan.repoRoot ?? "<your prs checkout>"
	return [plan.reason, "prs is not published to npm. To update it from source, run:", `  git -C ${location} pull --ff-only`, `  bun install --cwd ${location}`].join("\n")
}

const probeGit = (repoRoot: string, args: readonly string[]): GitResult => {
	const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" })
	return { status: result.exitCode ?? 1, stdout: result.stdout.toString() }
}

const pullFastForward = (repoRoot: string) => Bun.spawnSync(["git", "-C", repoRoot, "pull", "--ff-only"], { stdout: "inherit", stderr: "inherit", stdin: "ignore" }).exitCode ?? 1

/** Runs `prs upgrade` for the checkout at `repoRoot` and returns the exit code. */
export const runUpgrade = (repoRoot: string): number => {
	const plan = planUpgrade({ repoRoot, isCheckout: existsSync(join(repoRoot, ".git")), git: (args) => probeGit(repoRoot, args) })
	if (plan._tag === "Instructions") {
		console.error(upgradeInstructions(plan))
		return 1
	}

	console.log(`Updating prs in ${plan.repoRoot} (git pull --ff-only)`)
	const pullStatus = pullFastForward(plan.repoRoot)
	if (pullStatus !== 0) {
		console.error("git pull --ff-only failed. Your checkout was not changed; update it by hand.")
		return pullStatus
	}
	console.log(`Updated. Run \`bun install --cwd ${plan.repoRoot}\` if dependencies changed.`)
	return 0
}
