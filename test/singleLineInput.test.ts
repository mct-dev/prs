import { describe, expect, test } from "bun:test"
import { editSingleLineInput, singleLineText } from "../src/ui/singleLineInput.ts"

describe("single-line input editing", () => {
	test("handles clear, word delete, backspace, and printable text", () => {
		expect(editSingleLineInput("hello world", { name: "u", sequence: "", ctrl: true })).toBe("")
		expect(editSingleLineInput("hello world", { name: "w", sequence: "", ctrl: true })).toBe("hello")
		expect(editSingleLineInput("hello", { name: "backspace", sequence: "" })).toBe("hell")
		expect(editSingleLineInput("hello", { name: "x", sequence: "x" })).toBe("hellox")
	})

	test("ignores control sequences and collapses pasted newlines", () => {
		expect(editSingleLineInput("hello", { name: "up", sequence: "\u001b[A" })).toBeNull()
		expect(editSingleLineInput("hello", { name: "x", sequence: "x", meta: true })).toBeNull()
		expect(singleLineText("a\nb\r\nc")).toBe("a b c")
	})
})
