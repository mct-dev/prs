import { createWriteStream, type WriteStream } from "node:fs"
import { Effect, Exit, Schema } from "effect"
import type { AgentInvocation } from "./agents.js"

export class ReviewProcessError extends Schema.TaggedErrorClass<ReviewProcessError>()("ReviewProcessError", {
	command: Schema.String,
	detail: Schema.String,
}) {}

export interface ProcessResult {
	readonly stdout: string
	readonly stderr: string
	readonly exitCode: number
}

export interface RunLoggedOptions {
	readonly timeoutMs: number
	readonly log?: RunLog | null
	readonly env?: Readonly<Record<string, string | undefined>>
}

/** Append-only run log shared by every process spawned for one review. */
export interface RunLog {
	readonly write: (text: string) => void
	readonly close: () => Promise<void>
}

export const openRunLog = (path: string): RunLog => {
	const stream: WriteStream = createWriteStream(path, { flags: "a" })
	stream.on("error", () => {})
	return {
		write: (text) => {
			stream.write(text)
		},
		close: () => new Promise((resolve) => stream.end(() => resolve())),
	}
}

const KILL_GRACE_MS = 2_000

const signalGroup = (pid: number, signal: NodeJS.Signals) => {
	try {
		// Negative pid targets the whole process group (the child is spawned detached).
		process.kill(-pid, signal)
	} catch {
		try {
			process.kill(pid, signal)
		} catch {
			// already gone
		}
	}
}

/** SIGTERM the process group, then SIGKILL after a short grace period. */
const killGroup = (proc: Bun.Subprocess) =>
	Effect.promise(async () => {
		signalGroup(proc.pid, "SIGTERM")
		const exited = await Promise.race([proc.exited.then(() => true), Bun.sleep(KILL_GRACE_MS).then(() => false)])
		// Children may outlive the leader, so signal the group either way.
		signalGroup(proc.pid, "SIGKILL")
		if (!exited) await Promise.race([proc.exited, Bun.sleep(KILL_GRACE_MS)])
	})

const collect = async (stream: ReadableStream<Uint8Array> | null | undefined, onChunk: (text: string) => void) => {
	if (!stream) return ""
	const decoder = new TextDecoder()
	let text = ""
	// Bun's ReadableStream is async-iterable; the bundled lib types do not say so.
	for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
		const piece = decoder.decode(chunk, { stream: true })
		text += piece
		onChunk(piece)
	}
	const rest = decoder.decode()
	if (rest) {
		text += rest
		onChunk(rest)
	}
	return text
}

/**
 * Spawn a process in its own process group, stream stdout/stderr into the run
 * log, and kill the whole group on interruption or timeout. Non-zero exit is
 * not an error here; callers decide.
 */
export const runLogged = (invocation: AgentInvocation, options: RunLoggedOptions): Effect.Effect<ProcessResult, ReviewProcessError> => {
	const log = options.log ?? null
	const label = [invocation.command, ...invocation.args.map((arg) => (arg.length > 120 ? `${arg.slice(0, 117)}...` : arg))].join(" ")
	return Effect.acquireUseRelease(
		Effect.try({
			try: () => {
				log?.write(`\n$ ${label}\n`)
				return Bun.spawn({
					cmd: [invocation.command, ...invocation.args],
					cwd: invocation.cwd,
					env: { ...process.env, ...options.env },
					stdin: "ignore",
					stdout: "pipe",
					stderr: "pipe",
					detached: true,
				})
			},
			catch: (cause) => new ReviewProcessError({ command: invocation.command, detail: cause instanceof Error ? cause.message : String(cause) }),
		}),
		(proc) =>
			Effect.promise(async () => {
				const [stdout, stderr, exitCode] = await Promise.all([collect(proc.stdout, (text) => log?.write(text)), collect(proc.stderr, (text) => log?.write(text)), proc.exited])
				log?.write(`[exit ${exitCode}]\n`)
				return { stdout, stderr, exitCode } satisfies ProcessResult
			}).pipe(
				Effect.timeoutOrElse({
					duration: `${options.timeoutMs} millis`,
					orElse: () => Effect.fail(new ReviewProcessError({ command: invocation.command, detail: `Timed out after ${Math.round(options.timeoutMs / 1000)}s` })),
				}),
			),
		(proc, exit) =>
			Exit.isSuccess(exit) ? Effect.void : killGroup(proc).pipe(Effect.tap(() => Effect.sync(() => log?.write(Exit.hasInterrupts(exit) ? "[cancelled]\n" : "[killed]\n")))),
	)
}

/** Run a command and fail on non-zero exit. Used for git plumbing. */
export const runChecked = (invocation: AgentInvocation, options: RunLoggedOptions) =>
	runLogged(invocation, options).pipe(
		Effect.flatMap((result) =>
			result.exitCode === 0
				? Effect.succeed(result)
				: Effect.fail(
						new ReviewProcessError({
							command: [invocation.command, ...invocation.args.slice(0, 3)].join(" "),
							detail: result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`,
						}),
					),
		),
	)
