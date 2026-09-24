import { describe, expect, test } from "bun:test"
import { errorMessage } from "../src/errors.js"

describe("errorMessage", () => {
	test("Error instance returns its message", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom")
	})

	test("tagged-error-shaped object prefers detail over message", () => {
		expect(errorMessage({ _tag: "CommandError", detail: "gh: not authenticated", message: "fallback" })).toBe("gh: not authenticated")
	})

	test("plain { message } object falls back to message", () => {
		expect(errorMessage({ message: "fallback msg" })).toBe("fallback msg")
	})

	test("plain string", () => {
		expect(errorMessage("plain string")).toBe("plain string")
	})

	test("empty detail field falls through to message then string", () => {
		expect(errorMessage({ detail: "", message: "msg" })).toBe("msg")
		expect(errorMessage({ detail: "" })).toBe("[object Object]")
	})

	test("null and undefined stringify safely", () => {
		expect(errorMessage(null)).toBe("null")
		expect(errorMessage(undefined)).toBe("undefined")
	})

	test("numeric value stringifies", () => {
		expect(errorMessage(42)).toBe("42")
	})
})
