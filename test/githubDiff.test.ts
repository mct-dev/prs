import { describe, expect, test } from "bun:test"
import { pullRequestFilesToPatch } from "../src/services/githubNormalize.ts"
import { splitPatchFiles } from "../src/ui/diff.ts"

describe("pullRequestFilesToPatch", () => {
	test("builds a parseable multi-file diff from paginated files API data", () => {
		const patch = pullRequestFilesToPatch([
			{
				filename: "src/one.ts",
				previous_filename: null,
				status: "modified",
				patch: "@@ -1,2 +1,2 @@\n const a = 1\n-const b = 2\n+const b = 3",
			},
			{
				filename: "src/two.ts",
				previous_filename: null,
				status: "added",
				patch: "@@ -0,0 +1 @@\n+const c = 4",
			},
		])

		const files = splitPatchFiles(patch)

		expect(files.map((file) => file.name)).toEqual(["src/one.ts", "src/two.ts"])
		expect(files[1]!.patch).toContain("--- /dev/null")
		expect(files[1]!.patch).toContain("+++ b/src/two.ts")
	})

	test("preserves renamed file paths", () => {
		const patch = pullRequestFilesToPatch([
			{
				filename: "new.ts",
				previous_filename: "old.ts",
				status: "renamed",
				patch: "@@ -1 +1 @@\n-old\n+new",
			},
		])

		expect(patch).toContain("diff --git a/old.ts b/new.ts")
		expect(patch).toContain("rename from old.ts")
		expect(splitPatchFiles(patch)[0]!.name).toBe("new.ts")
	})

	test("preserves file paths with spaces", () => {
		const patch = pullRequestFilesToPatch([
			{
				filename: "src/with space.ts",
				previous_filename: null,
				status: "modified",
				patch: "@@ -1 +1 @@\n-old\n+new",
			},
		])

		expect(patch).toContain('diff --git "a/src/with space.ts" "b/src/with space.ts"')
		expect(splitPatchFiles(patch)[0]!.name).toBe("src/with space.ts")
	})
})
