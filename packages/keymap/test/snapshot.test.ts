import { describe, expect, test } from "bun:test"
import { command } from "../src/command.ts"
import { Keymap } from "../src/keymap.ts"
import { snapshot } from "../src/snapshot.ts"

interface Ctx {
	readonly modal: boolean
	readonly hasSelection: boolean
}

describe("snapshot", () => {
	test("serializable shape: sequence, status, meta", () => {
		const km = command<Ctx>({ id: "refresh", title: "Refresh", group: "App", keys: ["r"], run: () => {} })
		const snap = snapshot(km, { modal: false, hasSelection: false })
		expect(snap).toEqual([{
			sequence: "r",
			status: true,
			meta: { id: "refresh", title: "Refresh", group: "App" },
		}])
	})

	test("status reflects when/enabled gating", () => {
		const km = Keymap.union(
			command<Ctx>({ id: "modal", title: "M", keys: ["x"], when: (s) => s.modal, run: () => {} }),
			command<Ctx>({
				id: "merge",
				title: "Merge",
				keys: ["m"],
				enabled: (s) => s.hasSelection ? true : "Select first.",
				run: () => {},
			}),
		)

		const idle = snapshot(km, { modal: false, hasSelection: false })
		expect(idle.map((b) => b.status)).toEqual(["out of scope", "Select first."])

		const ready = snapshot(km, { modal: true, hasSelection: true })
		expect(ready.map((b) => b.status)).toEqual([true, true])
	})

	test("anonymous bindings get empty meta object", () => {
		const km = new Keymap<Ctx>([{ sequence: [{ key: "x", ctrl: false, shift: false, meta: false }], action: () => {} }])
		const [snap] = snapshot(km, { modal: false, hasSelection: false })
		expect(snap!.meta).toEqual({})
	})
})
