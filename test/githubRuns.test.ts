import { describe, expect, test } from "bun:test"
import { parseRunDetails, parseWorkflowRuns } from "../src/services/githubNormalize.js"

// Raw shapes mirror `gh run list --json …` and `gh run view --json …,jobs`.

describe("parseWorkflowRuns", () => {
	test("normalizes and sorts newest-first", () => {
		const raw = [
			{
				databaseId: 1,
				number: 1,
				attempt: 1,
				workflowName: "CI",
				name: "CI",
				displayTitle: "older",
				event: "push",
				headBranch: "main",
				headSha: "a",
				status: "completed",
				conclusion: "success",
				url: "u1",
				createdAt: "2026-01-01T00:00:00Z",
				startedAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:01:00Z",
			},
			{
				databaseId: 2,
				number: 2,
				attempt: 2,
				workflowName: "CI",
				name: "CI",
				displayTitle: "newer",
				event: "push",
				headBranch: "main",
				headSha: "b",
				status: "in_progress",
				conclusion: null,
				url: "u2",
				createdAt: "2026-01-02T00:00:00Z",
				startedAt: "2026-01-02T00:00:00Z",
				updatedAt: null,
			},
		]
		const runs = parseWorkflowRuns(raw)
		expect(runs.map((r) => r.displayTitle)).toEqual(["newer", "older"])
		expect(runs[0]!.status).toBe("in_progress")
		expect(runs[0]!.conclusion).toBeNull()
		expect(runs[0]!.attempt).toBe(2)
		expect(runs[1]!.conclusion).toBe("success")
		expect(runs[1]!.updatedAt).toEqual(new Date("2026-01-01T00:01:00Z"))
	})

	test("falls back to name and defaults", () => {
		const runs = parseWorkflowRuns([
			{
				databaseId: 3,
				number: 3,
				workflowName: null,
				name: "Fallback",
				displayTitle: null,
				event: null,
				headBranch: null,
				headSha: null,
				status: "queued",
				conclusion: null,
				url: null,
				createdAt: "2026-01-01T00:00:00Z",
				startedAt: null,
				updatedAt: null,
			},
		])
		expect(runs[0]!.workflowName).toBe("Fallback")
		expect(runs[0]!.attempt).toBe(1)
		expect(runs[0]!.status).toBe("queued")
		expect(runs[0]!.startedAt).toBeNull()
	})
})

describe("parseRunDetails", () => {
	test("normalizes jobs and steps, sorting steps by number", () => {
		const details = parseRunDetails({
			databaseId: 10,
			number: 5,
			attempt: 1,
			workflowName: "CI",
			name: "CI",
			displayTitle: "t",
			event: "pull_request",
			headBranch: "feat",
			headSha: "sha",
			status: "completed",
			conclusion: "failure",
			url: "u",
			createdAt: "2026-01-01T00:00:00Z",
			startedAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:02:00Z",
			jobs: [
				{
					databaseId: 100,
					name: "test",
					status: "completed",
					conclusion: "failure",
					startedAt: "2026-01-01T00:00:00Z",
					completedAt: "2026-01-01T00:02:00Z",
					url: "j",
					steps: [
						{ number: 2, name: "run", status: "completed", conclusion: "failure", startedAt: null, completedAt: null },
						{ number: 1, name: "setup", status: "completed", conclusion: "success", startedAt: null, completedAt: null },
					],
				},
			],
		})
		expect(details.jobs).toHaveLength(1)
		expect(details.jobs[0]!.id).toBe(100)
		expect(details.jobs[0]!.steps.map((s) => s.name)).toEqual(["setup", "run"])
		expect(details.jobs[0]!.steps[1]!.conclusion).toBe("failure")
	})

	test("tolerates missing jobs", () => {
		const details = parseRunDetails({
			databaseId: 11,
			number: 6,
			workflowName: "CI",
			name: "CI",
			displayTitle: "t",
			event: "push",
			headBranch: "main",
			headSha: "sha",
			status: "completed",
			conclusion: "success",
			url: "u",
			createdAt: "2026-01-01T00:00:00Z",
			startedAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:01:00Z",
		})
		expect(details.jobs).toEqual([])
	})
})
