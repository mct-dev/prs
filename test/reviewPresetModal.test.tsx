import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import { parseReviewConfig } from "../src/review/config.ts"
import { ReviewPresetModal, reviewPresetOptions } from "../src/ui/modals/ReviewPresetModal.tsx"
import { editFormText, moveFormField, requestDeletePreset, startEditPreset } from "../src/ui/modals/reviewPresetModel.ts"
import { initialReviewPresetModalState, type ReviewPresetModalState } from "../src/ui/modals/types.ts"

// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const originalConfigDir = process.env.GHUI_CONFIG_DIR
beforeAll(() => {
	process.env.GHUI_CONFIG_DIR = "/tmp/prs-test-config"
})
afterAll(() => {
	if (originalConfigDir === undefined) delete process.env.GHUI_CONFIG_DIR
	else process.env.GHUI_CONFIG_DIR = originalConfigDir
})

const WIDTH = 72
const HEIGHT = 16

const render = async (state: ReviewPresetModalState) => {
	const setup = await createTestRenderer({ width: WIDTH, height: HEIGHT })
	const root = createRoot(setup.renderer)
	act(() => root.render(<ReviewPresetModal state={state} modalWidth={WIDTH} modalHeight={HEIGHT} offsetLeft={0} offsetTop={0} />))
	await setup.renderOnce()
	const lines = setup.captureCharFrame().split("\n")
	act(() => root.unmount())
	setup.renderer.destroy()
	if (process.env.PRS_PRINT_FRAMES) console.log(lines.map((line) => line.trimEnd()).join("\n"))
	return lines
}

const presets = reviewPresetOptions(parseReviewConfig({ presets: { deep: { agent: "claude", model: "opus", maxBudgetUsd: 5 } } }))
const listed: ReviewPresetModalState = {
	...initialReviewPresetModalState,
	presets,
	selectedIndex: 0,
	skills: [
		{ name: "review", description: "Review a pull request", agent: "claude", source: "user" },
		{ name: "reviewkit:deep-review", description: "Deep review", agent: "claude", source: "plugin" },
	],
}

describe("ReviewPresetModal", () => {
	test("list rows show agent, skill, model, budget and the default", async () => {
		const lines = await render(listed)
		const row = (id: string) => lines.find((line) => line.includes(` ${id} `)) ?? ""
		expect(row("claude")).toMatch(/› claude\s+claude\s+review\s+default\s+\$3\s+default/)
		expect(row("codex")).toMatch(/codex\s+codex\s+none\s+default\s+—/)
		expect(row("deep")).toMatch(/deep\s+claude\s+none\s+opus\s+\$5/)
		expect(lines.some((line) => line.includes("enter run") && line.includes("e edit") && line.includes("x delete"))).toBe(true)
		expect(lines.some((line) => line.includes("config /tmp/prs-test-config/config.json"))).toBe(true)
		expect(lines.every((line) => line.length <= WIDTH)).toBe(true)
	})

	test("edit form shows fields, placeholders and skill suggestions", async () => {
		const lines = await render(editFormText(startEditPreset(listed), () => "rev"))
		expect(lines.some((line) => line.includes("Edit claude preset claude"))).toBe(true)
		expect(lines.some((line) => /› skill\s+rev▏/.test(line))).toBe(true)
		expect(lines.some((line) => /model\s+default \(sonnet, opus, haiku\)/.test(line))).toBe(true)
		expect(lines.some((line) => line.includes("reviewkit:deep-review") && line.includes("Deep review"))).toBe(true)
	})

	test("errors and the delete question show on the status row", async () => {
		const editing = moveFormField(moveFormField(startEditPreset(listed), 1), 1)
		const invalid = await render({ ...editFormText(editing, () => "0"), error: "Budget must be a number greater than 0 (or empty for none)." })
		expect(invalid.some((line) => line.includes("Budget must be a number greater than 0"))).toBe(true)
		const confirm = await render(requestDeletePreset(listed))
		expect(confirm.some((line) => line.includes("Delete preset claude? y deletes, n keeps."))).toBe(true)
	})

	test("new preset agent and name steps", async () => {
		const agent = await render({ ...listed, mode: "pickAgent", newAgent: "codex" })
		expect(agent.some((line) => /› codex\s+Codex CLI/.test(line))).toBe(true)
		const name = await render({ ...listed, mode: "name", newAgent: "claude", newName: "quick" })
		expect(name.some((line) => /› name\s+quick▏/.test(line))).toBe(true)
	})
})
