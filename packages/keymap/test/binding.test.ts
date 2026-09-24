import { describe, expect, test } from "bun:test"
import { type Binding, type Command, isBindingActive, isCommand } from "../src/binding.ts"
import { parseBinding } from "../src/keys.ts"

interface Ctx {
	readonly modal: boolean
	readonly hasSelection: boolean
}

const make = (overrides: Partial<Binding<Ctx>> = {}): Binding<Ctx> => ({
	sequence: parseBinding("x"),
	action: () => {},
	...overrides,
})

describe("isBindingActive", () => {
	test("no when, no enabled → true", () => {
		expect(isBindingActive(make(), { modal: false, hasSelection: false })).toBe(true)
	})

	test("when=false → 'out of scope'", () => {
		const binding = make({ when: (c) => c.modal })
		expect(isBindingActive(binding, { modal: false, hasSelection: false })).toBe("out of scope")
	})

	test("when=true, no enabled → true", () => {
		const binding = make({ when: (c) => c.modal })
		expect(isBindingActive(binding, { modal: true, hasSelection: false })).toBe(true)
	})

	test("enabled=false → 'disabled'", () => {
		const binding = make({ enabled: () => false })
		expect(isBindingActive(binding, { modal: false, hasSelection: false })).toBe("disabled")
	})

	test("enabled returns reason string → reason", () => {
		const binding = make({ enabled: (c) => c.hasSelection ? true : "Select first." })
		expect(isBindingActive(binding, { modal: false, hasSelection: false })).toBe("Select first.")
		expect(isBindingActive(binding, { modal: false, hasSelection: true })).toBe(true)
	})
})

describe("isCommand", () => {
	test("binding with id+title → true", () => {
		const binding = make({ meta: { id: "x", title: "X" } })
		expect(isCommand(binding)).toBe(true)
	})

	test("binding without meta → false", () => {
		expect(isCommand(make())).toBe(false)
	})

	test("binding with meta but no id → false", () => {
		expect(isCommand(make({ meta: { title: "X" } }))).toBe(false)
	})

	test("binding with meta but no title → false", () => {
		expect(isCommand(make({ meta: { id: "x" } }))).toBe(false)
	})

	test("narrows binding to Command type", () => {
		const binding = make({ meta: { id: "x", title: "X" } })
		if (isCommand(binding)) {
			const cmd: Command<Ctx> = binding
			// These accesses must be type-safe (no optional chaining required):
			expect(cmd.meta.id).toBe("x")
			expect(cmd.meta.title).toBe("X")
		}
	})
})
