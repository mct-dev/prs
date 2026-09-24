const result = await Bun.build({
	entrypoints: ["src/index.tsx"],
	external: ["@effect/atom-react", "@opentui/core", "@opentui/react", "@opentui/react/jsx-dev-runtime", "@opentui/react/jsx-runtime", "effect", "react", "scheduler"],
	format: "esm",
	outdir: "dist",
	target: "bun",
})

if (!result.success) {
	for (const log of result.logs) console.error(log)
	process.exit(1)
}
