import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { isSafeUrl } from "../src/safeUrl.ts"
import { BrowserOpener, platformOpener } from "../src/services/BrowserOpener.ts"
import { CommandRunner, type CommandResult } from "../src/services/CommandRunner.ts"

describe("isSafeUrl", () => {
	test("accepts plain web links", () => {
		expect(isSafeUrl("https://example.com/a?b=c#d")).toBe(true)
		expect(isSafeUrl("http://example.com")).toBe(true)
	})

	test("rejects other schemes, flags, controls and junk", () => {
		for (const url of [
			"javascript:alert(1)",
			"file:///etc/passwd",
			"mailto:someone@example.com",
			"vscode://open?file=x",
			"-a Calculator",
			"--help",
			"https://example.com/\u001b[2J",
			"https://example.com/\u0007",
			"not a url",
			"",
		])
			expect(isSafeUrl(url)).toBe(false)
	})
})

describe("BrowserOpener", () => {
	const opener = (calls: string[][]) =>
		BrowserOpener.layerNoDeps.pipe(
			Layer.provide(
				Layer.succeed(
					CommandRunner,
					CommandRunner.of({
						run: (command, args) => {
							calls.push([command, ...args])
							const result: CommandResult = { stdout: "", stderr: "", exitCode: 0 }
							return Effect.succeed(result)
						},
						runSchema: <S extends Schema.Top>(schema: S) => Schema.decodeUnknownEffect(schema)(null) as Effect.Effect<S["Type"], never, S["DecodingServices"]>,
					}),
				),
			),
		)
	const open = (url: string, calls: string[][]) => Effect.runPromise(BrowserOpener.use((browser) => browser.openUrl(url)).pipe(Effect.provide(opener(calls)), Effect.result))

	test("opens a web link with the platform opener", async () => {
		const calls: string[][] = []
		const result = await open("https://example.com/x", calls)
		expect(result._tag).toBe("Success")
		expect(calls).toEqual([[platformOpener().command, ...platformOpener().prefix, "https://example.com/x"]])
	})

	test("refuses unsafe URLs without running anything", async () => {
		const calls: string[][] = []
		for (const url of ["javascript:alert(1)", "-a Calculator", "file:///tmp/x"]) expect((await open(url, calls))._tag).toBe("Failure")
		expect(calls).toEqual([])
	})

	test("never routes through the Windows shell", () => {
		expect(platformOpener("win32")).toEqual({ command: "rundll32", prefix: ["url.dll,FileProtocolHandler"] })
	})
})
