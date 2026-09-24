import { homedir } from "node:os"
import { join } from "node:path"
import { Config, Effect } from "effect"
import { envConfig, envVar } from "./env.js"

const positiveIntOr = (fallback: number) => (value: number) => (Number.isFinite(value) && value > 0 ? value : fallback)

const pageSizeOr = (fallback: number) => (value: number) => Math.min(100, positiveIntOr(fallback)(value))

const defaultCachePath = () => join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "prs", "cache.sqlite")

const resolveCachePath = () => {
	const value = envVar("CACHE_PATH")?.trim()
	if (value === "off" || value === "0" || value === "false") return null
	return value && value.length > 0 ? value : defaultCachePath()
}

const appConfig = Config.all({
	prFetchLimit: envConfig(Config.int, "PR_FETCH_LIMIT").pipe(Config.withDefault(500), Config.map(positiveIntOr(500))),
	prPageSize: envConfig(Config.int, "PR_PAGE_SIZE").pipe(Config.withDefault(50), Config.map(pageSizeOr(50))),
	commandTimeoutMs: envConfig(Config.int, "COMMAND_TIMEOUT_MS").pipe(Config.withDefault(15_000), Config.map(positiveIntOr(15_000))),
	runFetchLimit: envConfig(Config.int, "RUN_FETCH_LIMIT").pipe(Config.withDefault(20), Config.map(positiveIntOr(20))),
	cachePath: Config.succeed(resolveCachePath()),
})

export const config = Effect.runSync(
	Effect.gen(function* () {
		return yield* appConfig
	}),
)
