import { homedir } from "node:os"
import { describe, expect, test } from "bun:test"
import { commandNeedsRepoPath, type EditorCommandFields, renderEditorCommand, resolveRepoPath } from "../src/editorCommand.js"

const fields: EditorCommandFields = {
	repository: "dlvhdr/gh-dash",
	number: 42,
	headRef: "feature/x",
	baseRef: "main",
	author: "octocat",
	url: "https://github.com/dlvhdr/gh-dash/pull/42",
}

describe("resolveRepoPath", () => {
	test("exact full-name match wins over wildcard and template", () => {
		const paths = {
			"dlvhdr/gh-dash": "/code/gh-dash",
			"dlvhdr/*": "/code/repos/dlvhdr/*",
			":owner/:repo": "/src/github.com/:owner/:repo",
		}
		expect(resolveRepoPath(paths, "dlvhdr/gh-dash")).toBe("/code/gh-dash")
	})

	test("owner wildcard expands * to repo name", () => {
		expect(resolveRepoPath({ "dlvhdr/*": "/code/repos/dlvhdr/*" }, "dlvhdr/other")).toBe("/code/repos/dlvhdr/other")
	})

	test("generic template substitutes :owner and :repo", () => {
		expect(resolveRepoPath({ ":owner/:repo": "/src/github.com/:owner/:repo" }, "acme/widget")).toBe("/src/github.com/acme/widget")
	})

	test("wildcard beats template", () => {
		const paths = { "dlvhdr/*": "/code/dlvhdr/*", ":owner/:repo": "/src/:owner/:repo" }
		expect(resolveRepoPath(paths, "dlvhdr/repo")).toBe("/code/dlvhdr/repo")
	})

	test("returns null when nothing matches", () => {
		expect(resolveRepoPath({ "dlvhdr/*": "/code/*" }, "acme/widget")).toBeNull()
	})

	test("expands ~ to home directory", () => {
		expect(resolveRepoPath({ "dlvhdr/gh-dash": "~/code/gh-dash" }, "dlvhdr/gh-dash")).toBe(`${homedir()}/code/gh-dash`)
	})

	test("handles bare ~", () => {
		expect(resolveRepoPath({ "dlvhdr/gh-dash": "~" }, "dlvhdr/gh-dash")).toBe(homedir())
	})

	test("returns null for malformed repository", () => {
		expect(resolveRepoPath({ ":owner/:repo": "/src/:owner/:repo" }, "not-a-repo")).toBeNull()
	})
})

describe("renderEditorCommand", () => {
	test("substitutes every known token", () => {
		const out = renderEditorCommand("nvim {{repo}} {{owner}} {{name}} {{number}} {{headRef}} {{baseRef}} {{author}} {{url}} {{repoPath}}", fields, "/code/gh-dash")
		expect(out).toBe("nvim dlvhdr/gh-dash dlvhdr gh-dash 42 feature/x main octocat https://github.com/dlvhdr/gh-dash/pull/42 /code/gh-dash")
	})

	test("supports gh-dash-style headRefName/baseRefName aliases", () => {
		expect(renderEditorCommand("{{headRefName}} {{baseRefName}}", fields, null)).toBe("feature/x main")
	})

	test("empty repoPath when unresolved", () => {
		expect(renderEditorCommand("cd {{repoPath}} && nvim", fields, null)).toBe("cd  && nvim")
	})

	test("leaves unknown tokens untouched", () => {
		expect(renderEditorCommand("{{bogus}} {{number}}", fields, null)).toBe("{{bogus}} 42")
	})

	test("tolerates whitespace inside braces", () => {
		expect(renderEditorCommand("{{ number }}", fields, null)).toBe("42")
	})

	test("renders the canonical diffview recipe", () => {
		const template = "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'"
		expect(renderEditorCommand(template, fields, "/code/gh-dash")).toBe("tmux new-window -c /code/gh-dash 'gh pr checkout 42 && nvim -c \":DiffviewOpen main...feature/x\"'")
	})
})

describe("commandNeedsRepoPath", () => {
	test("true when {{repoPath}} present", () => {
		expect(commandNeedsRepoPath("cd {{repoPath}} && nvim")).toBe(true)
	})

	test("false otherwise", () => {
		expect(commandNeedsRepoPath("gh pr view {{number}}")).toBe(false)
	})
})
