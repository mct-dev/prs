import { describe, expect, test } from "bun:test"
import { planUpgrade, upgradeInstructions, type GitResult } from "../src/upgrade.js"

const ok = (stdout = ""): GitResult => ({ status: 0, stdout })
const fail: GitResult = { status: 1, stdout: "" }

const fakeGit = (responses: Partial<Record<"status" | "symbolic-ref" | "rev-parse", GitResult>>) => {
	const calls: string[][] = []
	const git = (args: readonly string[]) => {
		calls.push([...args])
		return responses[args[0] as keyof typeof responses] ?? ok()
	}
	return { git, calls }
}

const repoRoot = "/src/prs"

describe("planUpgrade", () => {
	test("pulls a clean checkout on a branch with an upstream", () => {
		const { git, calls } = fakeGit({})
		expect(planUpgrade({ repoRoot, isCheckout: true, git })).toEqual({ _tag: "Pull", repoRoot })
		expect(calls.map((args) => args[0])).toEqual(["status", "symbolic-ref", "rev-parse"])
	})

	test("never touches git outside a checkout", () => {
		const { git, calls } = fakeGit({})
		const plan = planUpgrade({ repoRoot, isCheckout: false, git })
		expect(plan._tag).toBe("Instructions")
		expect(calls).toEqual([])
	})

	test("prints instructions when there are uncommitted changes", () => {
		const { git } = fakeGit({ status: ok(" M src/App.tsx\n") })
		expect(planUpgrade({ repoRoot, isCheckout: true, git })).toMatchObject({ _tag: "Instructions", reason: expect.stringContaining("uncommitted") })
	})

	test("prints instructions on a detached HEAD", () => {
		const { git } = fakeGit({ "symbolic-ref": fail })
		expect(planUpgrade({ repoRoot, isCheckout: true, git })).toMatchObject({ _tag: "Instructions", reason: expect.stringContaining("not on a branch") })
	})

	test("prints instructions when the branch has no upstream", () => {
		const { git } = fakeGit({ "rev-parse": fail })
		expect(planUpgrade({ repoRoot, isCheckout: true, git })).toMatchObject({ _tag: "Instructions", reason: expect.stringContaining("no upstream") })
	})

	test("instructions point at the checkout and never mention npm install", () => {
		const text = upgradeInstructions({ _tag: "Instructions", reason: "Dirty.", repoRoot })
		expect(text).toContain(`git -C ${repoRoot} pull --ff-only`)
		expect(text).not.toContain("npm install")
	})
})
