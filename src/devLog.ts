// Append-only JSONL trace logger for diagnosing live bugs in `bun run dev`.
//
// Enabled by setting `PRS_DEBUG_LOG=<path>` (or legacy `GHUI_DEBUG_LOG`). The `dev` script in
// `package.json` defaults this to `/tmp/prs-debug.log` so developers get
// a trace by default; production binaries never set the env var so this
// module is a no-op there.
//
// Truncates the log at the first call per process so each session is
// self-contained. Every call is `appendFileSync` to keep ordering stable
// across React renders, Effect fibers, and the renderer event loop —
// we want the trace to reflect actual execution order, not async-flushed
// gibberish. Swallows all errors: a broken log file must never crash
// the app.

import { appendFileSync, writeFileSync } from "node:fs"
import { envVar } from "./env.js"

const LOG_PATH = envVar("DEBUG_LOG") ?? null

let initialized = false
const ensureInit = () => {
	if (initialized || !LOG_PATH) return
	initialized = true
	try {
		writeFileSync(LOG_PATH, `=== prs session ${new Date().toISOString()} pid=${process.pid} ===\n`)
	} catch {
		// no-op
	}
}

export const devLogEnabled = LOG_PATH !== null

// Cheap when disabled — early-return before any work. When enabled,
// serialises `data` with a defensive fallback so circular objects
// don't kill the call.
export const devLog = (scope: string, data?: unknown): void => {
	if (!LOG_PATH) return
	ensureInit()
	let body: string
	try {
		body = data === undefined ? "" : ` ${JSON.stringify(data)}`
	} catch {
		body = ` ${String(data)}`
	}
	try {
		appendFileSync(LOG_PATH, `${new Date().toISOString()} [${scope}]${body}\n`)
	} catch {
		// no-op
	}
}
