import { resolve } from "node:path"
import packageJson from "../package.json" with { type: "json" }
import { runUpgrade } from "./upgrade.js"

const help = `prs ${packageJson.version}

Agent-assisted PR review in your terminal.

Usage:
  prs              Start the TUI
  prs upgrade      Update a clean source checkout (git pull --ff-only)
  prs -v, --version
                   Print the installed version
  prs -h, --help   Show this help message
`

const args = Bun.argv.slice(2)
const command = args[0]
const commands = ["help", "version", "upgrade"]

const editDistance = (a: string, b: string) => {
	const distances = Array.from({ length: a.length + 1 }, (_, i) => [i])
	for (let j = 1; j <= b.length; j++) distances[0]![j] = j

	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			distances[i]![j] = Math.min(distances[i - 1]![j]! + 1, distances[i]![j - 1]! + 1, distances[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
		}
	}

	return distances[a.length]![b.length]!
}

if (command === "-h" || command === "--help" || command === "help") {
	console.log(help)
	process.exit(0)
}

if (command === "-v" || command === "--version" || command === "version") {
	console.log(packageJson.version)
	process.exit(0)
}

if (command === "upgrade") {
	// A compiled binary resolves this inside its virtual filesystem, so it never looks like a checkout.
	process.exit(runUpgrade(resolve(import.meta.dir, "..")))
}

if (typeof command === "string") {
	const unknownCommand = command
	const suggestion = commands.find((name) => editDistance(unknownCommand, name) <= 2)
	console.error(`Unknown command: ${unknownCommand}`)
	if (suggestion) console.error(`Did you mean: prs ${suggestion}?`)
	console.error("Run `prs --help` for usage.")
	process.exit(1)
}

await import("./index.js")
