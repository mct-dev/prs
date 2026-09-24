import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { parseReviewConfig } from "../src/review/config.ts"
import { deletePresetRaw, newPresetValues, presetNameError, setDefaultPresetRaw, upsertPresetRaw, validatePresetForm } from "../src/review/presetEdits.ts"
import { loadStoredReviewConfig, updateStoredReviewConfig } from "../src/themeStore.ts"
import { initialReviewPresetModalState } from "../src/ui/modals/types.ts"
import { reviewPresetOptions } from "../src/ui/modals/ReviewPresetModal.tsx"
import {
	confirmNewAgent,
	confirmNewName,
	cycleSuggestion,
	editFormText,
	editNewName,
	moveFormField,
	moveNewAgent,
	presetSuggestions,
	requestDeletePreset,
	startEditPreset,
	startNewPreset,
	toList,
} from "../src/ui/modals/reviewPresetModel.ts"

const draft = { id: "deep", agent: "claude", skill: "review", model: "opus", maxBudgetUsd: 5, extraPrompt: "" } as const

describe("parseReviewConfig preset removal", () => {
	test("null removes a built-in and the default falls back", () => {
		const config = parseReviewConfig({ default: "claude", presets: { claude: null } })
		expect(Object.keys(config.presets)).toEqual(["codex"])
		expect(config.defaultPreset).toBe("codex")
	})

	test("removing every preset restores the built-ins", () => {
		const config = parseReviewConfig({ presets: { claude: null, codex: null } })
		expect(Object.keys(config.presets).sort()).toEqual(["claude", "codex"])
	})
})

describe("raw review edits", () => {
	test("upsert merges over the stored entry and keeps unknown keys", () => {
		const review = { concurrency: 3, presets: { deep: { agent: "claude", command: "/opt/claude", model: "sonnet" }, other: { agent: "codex" } } }
		const next = upsertPresetRaw(review, { ...draft, skill: null })
		expect(next).toEqual({
			concurrency: 3,
			presets: {
				deep: { agent: "claude", command: "/opt/claude", model: "opus", skill: null, maxBudgetUsd: 5, extraPrompt: "" },
				other: { agent: "codex" },
			},
		})
		expect(parseReviewConfig(next).presets.deep).toMatchObject({ skill: null, model: "opus", maxBudgetUsd: 5, command: "/opt/claude" })
	})

	test("set default only touches default", () => {
		expect(setDefaultPresetRaw({ presets: {}, timeoutMinutes: 5 }, "codex")).toEqual({ presets: {}, timeoutMinutes: 5, default: "codex" })
		expect(setDefaultPresetRaw(undefined, "codex")).toEqual({ default: "codex" })
	})

	test("deleting a built-in writes null; deleting the default reassigns it", () => {
		const review = { default: "claude" }
		const next = deletePresetRaw(review, "claude", parseReviewConfig(review))
		expect(next).toEqual({ default: "codex", presets: { claude: null } })
		expect(Object.keys(parseReviewConfig(next).presets)).toEqual(["codex"])
	})

	test("deleting a user preset removes its key", () => {
		const review = { default: "claude", presets: { deep: { agent: "claude" } } }
		expect(deletePresetRaw(review, "deep", parseReviewConfig(review))).toEqual({ default: "claude", presets: {} })
	})

	test("the last preset and unknown ids are refused", () => {
		const review = { presets: { codex: null } }
		expect(deletePresetRaw(review, "claude", parseReviewConfig(review))).toBeNull()
		expect(deletePresetRaw({}, "missing", parseReviewConfig({}))).toBeNull()
	})
})

describe("preset form validation", () => {
	const values = newPresetValues("claude")

	test("budget must be a positive number or empty", () => {
		for (const budget of ["0", "-1", "abc", "$"]) {
			expect(validatePresetForm("x", "claude", { ...values, maxBudgetUsd: budget })).toMatchObject({ _tag: "error", field: "maxBudgetUsd" })
		}
		expect(validatePresetForm("x", "claude", { ...values, maxBudgetUsd: "$2.50" })).toMatchObject({ _tag: "ok", draft: { maxBudgetUsd: 2.5 } })
		expect(validatePresetForm("x", "claude", { ...values, maxBudgetUsd: " " })).toMatchObject({ _tag: "ok", draft: { maxBudgetUsd: null } })
	})

	test("blank fields become null; names with spaces are rejected", () => {
		expect(validatePresetForm("x", "codex", newPresetValues("codex"))).toEqual({
			_tag: "ok",
			draft: { id: "x", agent: "codex", skill: null, model: null, maxBudgetUsd: null, extraPrompt: "" },
		})
		expect(validatePresetForm("x", "claude", { ...values, skill: "two words" })).toMatchObject({ _tag: "error", field: "skill" })
		expect(validatePresetForm("x", "claude", { ...values, model: "big model" })).toMatchObject({ _tag: "error", field: "model" })
		expect(validatePresetForm("x", "claude", { ...values, model: "--dangerously-skip-permissions" })).toMatchObject({
			_tag: "error",
			field: "model",
			message: "Model names can't start with -.",
		})
	})

	test("preset names", () => {
		const config = parseReviewConfig({})
		expect(presetNameError("  ", config)).toBe("Name the preset.")
		expect(presetNameError("has space", config)).toMatch(/letters, digits/)
		expect(presetNameError("-lead", config)).toMatch(/letters, digits/)
		expect(presetNameError("claude", config)).toBe("A preset named claude exists.")
		expect(presetNameError("deep.v2_x-1", config)).toBeNull()
	})
})

describe("updateStoredReviewConfig", () => {
	const originalConfigDir = process.env.GHUI_CONFIG_DIR
	const tempDirs: string[] = []

	afterEach(async () => {
		if (originalConfigDir === undefined) delete process.env.GHUI_CONFIG_DIR
		else process.env.GHUI_CONFIG_DIR = originalConfigDir
		await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
		tempDirs.length = 0
	})

	test("writes review edits and keeps every other key", async () => {
		const dir = await mkdtemp(join(tmpdir(), "prs-review-config-"))
		tempDirs.push(dir)
		process.env.GHUI_CONFIG_DIR = dir
		await writeFile(join(dir, "config.json"), JSON.stringify({ theme: "tokyo-night", review: { concurrency: 4, presets: { codex: { model: "o3" } } } }))

		await Effect.runPromise(updateStoredReviewConfig((review) => upsertPresetRaw(review, draft)))
		await Effect.runPromise(updateStoredReviewConfig((review) => setDefaultPresetRaw(review, "deep")))

		const stored = JSON.parse(await readFile(join(dir, "config.json"), "utf8"))
		expect(stored.theme).toBe("tokyo-night")
		expect(stored.review.concurrency).toBe(4)
		expect(stored.review.presets.codex).toEqual({ model: "o3" })
		expect(stored.review.default).toBe("deep")
		const loaded = (await Effect.runPromise(loadStoredReviewConfig)).review
		expect(loaded.defaultPreset).toBe("deep")
		expect(loaded.presets.deep).toMatchObject({ agent: "claude", model: "opus", maxBudgetUsd: 5 })
	})

	test("writes through a temp file and leaves no temp files behind", async () => {
		const dir = await mkdtemp(join(tmpdir(), "prs-review-config-"))
		tempDirs.push(dir)
		process.env.GHUI_CONFIG_DIR = dir
		await Effect.runPromise(updateStoredReviewConfig((review) => upsertPresetRaw(review, draft)))
		expect(await readdir(dir)).toEqual(["config.json"])
	})

	test("creates the file when it does not exist", async () => {
		const dir = await mkdtemp(join(tmpdir(), "prs-review-config-"))
		tempDirs.push(dir)
		process.env.GHUI_CONFIG_DIR = join(dir, "nested")
		await Effect.runPromise(updateStoredReviewConfig((review) => setDefaultPresetRaw(review, "codex")))
		expect(JSON.parse(await readFile(join(dir, "nested", "config.json"), "utf8"))).toEqual({ review: { default: "codex" } })
	})
})

describe("preset modal transitions", () => {
	const presets = reviewPresetOptions(parseReviewConfig({ presets: { deep: { agent: "claude", model: "opus" } } }))
	const listed = { ...initialReviewPresetModalState, presets, selectedIndex: 0 }
	const skills = [
		{ name: "review", description: "Review a PR", agent: "claude", source: "user" },
		{ name: "reviewkit:deep-review", description: "Deep", agent: "claude", source: "plugin" },
	] as const

	test("new preset: agent, then a validated name, then the form", () => {
		let state = moveNewAgent(startNewPreset(listed), 1)
		expect(state.mode).toBe("pickAgent")
		expect(state.newAgent).toBe("codex")
		state = confirmNewAgent(state)
		expect(state.mode).toBe("name")
		state = confirmNewName(editNewName(state, () => "deep"))
		expect(state.error).toBe("A preset named deep exists.")
		state = confirmNewName(editNewName(state, () => "quick"))
		expect(state.mode).toBe("edit")
		expect(state.form).toMatchObject({ presetId: "quick", agent: "codex", isNew: true, field: "skill" })
		expect(toList(state)).toMatchObject({ mode: "list", form: null })
	})

	test("edit: fields cycle and tab completes skills shell-style", () => {
		let state = { ...startEditPreset(listed), skills }
		expect(state.form).toMatchObject({ presetId: "claude", values: { skill: "review", maxBudgetUsd: "3" } })
		state = editFormText(state, () => "rev")
		expect(presetSuggestions(state).map((suggestion) => suggestion.value)).toEqual(["review", "reviewkit:deep-review"])
		state = cycleSuggestion(state, 1)
		expect(state.form?.values.skill).toBe("review")
		state = cycleSuggestion(state, 1)
		expect(state.form?.values.skill).toBe("reviewkit:deep-review")
		state = cycleSuggestion(state, 1)
		expect(state.form?.values.skill).toBe("review")
		state = moveFormField(state, 1)
		expect(state.form?.field).toBe("model")
		expect(presetSuggestions(state).map((suggestion) => suggestion.value)).toEqual(["sonnet", "opus", "haiku"])
		state = moveFormField(moveFormField(state, 1), 1)
		expect(state.form?.field).toBe("extraPrompt")
		// Nothing to complete: tab moves on (wrapping to the first field).
		expect(cycleSuggestion(state, 1).form?.field).toBe("skill")
	})

	test("delete asks first and never offers the last preset", () => {
		expect(requestDeletePreset(listed).mode).toBe("confirmDelete")
		const single = { ...listed, presets: presets.slice(0, 1) }
		expect(requestDeletePreset(single)).toMatchObject({ mode: "list", error: "Can't delete the last preset." })
	})
})
