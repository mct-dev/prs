import { describe, expect, test } from "bun:test"
import {
	backspace,
	commentEditorSoftLines,
	deleteForward,
	deleteToLineEnd,
	deleteToLineStart,
	deleteWordBackward,
	deleteWordForward,
	insertText,
	moveLeft,
	moveLineEnd,
	moveLineStart,
	moveRight,
	moveVertically,
	moveWordBackward,
	moveWordForward,
	type CommentEditorValue,
} from "../src/ui/commentEditor.ts"

const state = (body: string, cursor = body.length): CommentEditorValue => ({ body, cursor })

describe("comment editor", () => {
	test("inserts text at the cursor", () => {
		expect(insertText(state("helo", 2), "l")).toEqual(state("hello", 3))
	})

	test("moves by character", () => {
		expect(moveLeft(state("hello", 3)).cursor).toBe(2)
		expect(moveRight(state("hello", 3)).cursor).toBe(4)
		expect(moveLeft(state("hello", 0)).cursor).toBe(0)
		expect(moveRight(state("hello", 5)).cursor).toBe(5)
	})

	test("moves to line boundaries", () => {
		expect(moveLineStart(state("one\ntwo three", 9)).cursor).toBe(4)
		expect(moveLineEnd(state("one\ntwo three", 5)).cursor).toBe(13)
	})

	test("moves by word", () => {
		expect(moveWordBackward(state("one two  three")).cursor).toBe(9)
		expect(moveWordBackward(state("one two  three", 9)).cursor).toBe(4)
		expect(moveWordForward(state("one two  three", 4)).cursor).toBe(7)
	})

	test("moves vertically while preserving column", () => {
		const body = "abc\ndefgh\nxy"
		expect(moveVertically(state(body, 5), 1).cursor).toBe(11)
		expect(moveVertically(state(body, 11), -1).cursor).toBe(5)
		expect(moveVertically(state(body, 8), 1).cursor).toBe(12)
	})

	test("soft-wraps editor lines for display", () => {
		expect(commentEditorSoftLines("abcdef\ngh", 3)).toEqual([
			{ text: "abc", start: 0, end: 3 },
			{ text: "def", start: 3, end: 6 },
			{ text: "gh", start: 7, end: 9 },
		])
	})

	test("deletes backward and forward", () => {
		expect(backspace(state("helo", 2))).toEqual(state("hlo", 1))
		expect(deleteForward(state("helo", 2))).toEqual(state("heo", 2))
	})

	test("deletes words", () => {
		expect(deleteWordBackward(state("one two  three"))).toEqual(state("one two  ", 9))
		expect(deleteWordForward(state("one two  three", 4))).toEqual(state("one   three", 4))
	})

	test("deletes to line boundaries", () => {
		expect(deleteToLineStart(state("one\ntwo three", 8))).toEqual(state("one\nthree", 4))
		expect(deleteToLineEnd(state("one\ntwo three", 8))).toEqual(state("one\ntwo ", 8))
	})
})
