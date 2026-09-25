// Records docs/demo.gif: a short walk through the app on the screenshot mock data.
//
//   bun run demo
//
// Same sandbox as dev/screenshots.ts (throwaway HOME, synthetic my-org data).
// Each step's settled frame becomes an SVG, headless Chrome rasterizes it and
// ffmpeg joins the PNGs into a palette-optimized GIF. Needs ffmpeg and Chrome
// (or Playwright's chrome-headless-shell); set PRS_DEMO_CHROME to override.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { buildFixture, childEnv, type Frame, frameToSvg, hasFooter, type Step, startApp, THEME } from "./screenshots.ts"

interface Shot {
	readonly step?: Step
	/** Seconds this frame stays on screen. */
	readonly hold: number
	readonly ready?: (frame: string) => boolean
}

const type = (text: string, hold = 0.12): readonly Shot[] => [...text].map((char) => ({ step: { type: char }, hold }))

const script: readonly Shot[] = [
	{ hold: 2 },
	{ step: { key: "j" }, hold: 0.6 },
	{ step: { key: "k" }, hold: 0.6 },
	{ step: { key: "return" }, hold: 2.5, ready: (f) => f.includes("Summary") && hasFooter(f) },
	{ step: { key: "escape" }, hold: 0.8 },
	...type("/ci:pass"),
	{ step: { key: "return" }, hold: 2 },
	{ step: { key: "escape" }, hold: 0.8 },
	{ step: { key: "v" }, hold: 2.5, ready: (f) => f.includes("Double delivery") && hasFooter(f) },
	{ step: { key: "j" }, hold: 0.8 },
	{ step: { key: "k" }, hold: 0.8 },
	{ step: { key: "return" }, hold: 2.5, ready: (f) => f.includes("deliver.ts") && hasFooter(f) },
	{ step: { key: "j" }, hold: 0.4 },
	{ step: { key: "j" }, hold: 0.4 },
	{ step: { key: "j" }, hold: 1 },
	{ step: { key: "escape" }, hold: 1.5, ready: (f) => f.includes("Focus areas") },
	{ step: { key: "escape" }, hold: 1 },
	{ step: { key: "m" }, hold: 2, ready: (f) => /squash/i.test(f) },
	{ step: { key: "escape" }, hold: 2 },
]

const repoRoot = new URL("..", import.meta.url).pathname
const outPath = join(repoRoot, "docs", "demo.gif")
const WIDTH = 960

const findChrome = () => {
	const fromEnv = process.env.PRS_DEMO_CHROME
	if (fromEnv) return fromEnv
	const playwright = join(homedir(), "Library", "Caches", "ms-playwright")
	const candidates = existsSync(playwright)
		? readdirSync(playwright)
				.filter((name) => name.startsWith("chromium_headless_shell-"))
				.flatMap((name) => readdirSync(join(playwright, name)).map((platform) => join(playwright, name, platform, "chrome-headless-shell")))
		: []
	candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium")
	const found = candidates.find((path) => existsSync(path))
	if (!found) throw new Error("demo: no Chrome found; set PRS_DEMO_CHROME")
	return found
}

const run = async (command: readonly string[]) => {
	const child = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" })
	const [stderr, code] = await Promise.all([Bun.readableStreamToText(child.stderr), child.exited])
	if (code !== 0) throw new Error(`demo: ${command[0]} failed (exit ${code}):\n${stderr}`)
}

// Child: play the script and print one {frame, hold} JSON line per shot.
const runChild = async () => {
	const app = await startApp()
	for (const [index, shot] of script.entries()) {
		if (shot.step) await app.press(shot.step)
		await app.settle(shot.ready ?? (() => true), `shot ${index}`)
		console.log(JSON.stringify({ frame: app.capture(), hold: shot.hold }))
	}
	app.stop()
	process.exit(0)
}

const runParent = async () => {
	const chrome = findChrome()
	const temp = mkdtempSync(join(tmpdir(), "prs-demo-"))
	try {
		mkdirSync(join(temp, "config"), { recursive: true })
		mkdirSync(join(temp, "home"), { recursive: true })
		mkdirSync(join(temp, "frames"), { recursive: true })
		writeFileSync(join(temp, "config", "config.json"), JSON.stringify({ theme: THEME }))
		writeFileSync(join(temp, "fixture.json"), JSON.stringify(buildFixture()))
		const child = Bun.spawn(["bun", import.meta.path, "--child"], { cwd: repoRoot, env: childEnv(temp), stdout: "pipe", stderr: "pipe", timeout: 300_000 })
		const [stdout, stderr, code] = await Promise.all([Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr), child.exited])
		if (code !== 0) throw new Error(`demo: recording failed (exit ${code}):\n${stderr}`)
		const shots = stdout
			.split("\n")
			.filter((line) => line.startsWith('{"frame"'))
			.map((line) => JSON.parse(line) as { frame: Frame; hold: number })

		const concat: string[] = []
		for (const [index, shot] of shots.entries()) {
			const svg = frameToSvg(shot.frame, "prs")
			const [, width, height] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)!
			const svgPath = join(temp, "frames", `${index}.svg`)
			const pngPath = join(temp, "frames", `${index}.png`)
			writeFileSync(svgPath, svg)
			await run([
				chrome,
				"--headless",
				"--disable-gpu",
				"--hide-scrollbars",
				"--default-background-color=00000000",
				`--window-size=${Math.ceil(Number(width))},${Math.ceil(Number(height))}`,
				`--screenshot=${pngPath}`,
				`file://${svgPath}`,
			])
			concat.push(`file '${pngPath}'`, `duration ${shot.hold}`)
		}
		// The concat demuxer ignores the last duration unless the file repeats.
		concat.push(concat.at(-2)!)
		const list = join(temp, "frames.txt")
		writeFileSync(list, concat.join("\n") + "\n")
		const filter = `scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`
		await run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-filter_complex", filter, "-fps_mode", "vfr", "-loop", "0", outPath])
		console.log(`wrote ${outPath} (${shots.length} frames, ${(statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`)
	} finally {
		rmSync(temp, { recursive: true, force: true })
	}
}

if (import.meta.main) {
	if (process.argv[2] === "--child") {
		await runChild().catch((error: unknown) => {
			console.error(error)
			process.exit(1)
		})
	} else {
		await runParent()
	}
}
