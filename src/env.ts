import { Config } from "effect"

// prs reads `PRS_*` environment variables. The `GHUI_*` names inherited from
// upstream still work as a fallback so existing shells and scripts keep working.
export const ENV_PREFIX = "PRS_"
export const LEGACY_ENV_PREFIX = "GHUI_"

type Env = Readonly<Record<string, string | undefined>>

/** Reads `PRS_<name>`, falling back to `GHUI_<name>`. */
export const envVar = (name: string, env: Env = process.env): string | undefined => env[`${ENV_PREFIX}${name}`] ?? env[`${LEGACY_ENV_PREFIX}${name}`]

/**
 * Builds an Effect `Config` that reads `PRS_<name>` and falls back to
 * `GHUI_<name>`. Pipe `Config.withDefault` after this, not before, or the
 * fallback is never read.
 */
export const envConfig = <A>(make: (key: string) => Config.Config<A>, name: string): Config.Config<A> =>
	make(`${ENV_PREFIX}${name}`).pipe(Config.orElse(() => make(`${LEGACY_ENV_PREFIX}${name}`)))
