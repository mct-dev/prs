import { Config, Effect, Option } from "effect"

// prs reads `PRS_*` environment variables. The `GHUI_*` names inherited from
// upstream still work as a fallback so existing shells and scripts keep working.
export const ENV_PREFIX = "PRS_"
export const LEGACY_ENV_PREFIX = "GHUI_"

type Env = Readonly<Record<string, string | undefined>>

/** Reads `PRS_<name>`, falling back to `GHUI_<name>`. */
export const envVar = (name: string, env: Env = process.env): string | undefined => env[`${ENV_PREFIX}${name}`] ?? env[`${LEGACY_ENV_PREFIX}${name}`]

/**
 * Builds an Effect `Config` that reads `PRS_<name>` and falls back to
 * `GHUI_<name>` when `PRS_<name>` is unset.
 */
export const envConfig = <A>(make: (key: string) => Config.Config<A>, name: string): Config.Config<A> =>
	make(`${ENV_PREFIX}${name}`).pipe(
		Config.orElse((error) =>
			// Fall back only when `PRS_<name>` is unset: an invalid value must fail
			// loudly rather than silently read `GHUI_<name>`.
			Config.all([
				Config.option(Config.string(`${ENV_PREFIX}${name}`)).pipe(Config.mapOrFail((prsValue) => (Option.isSome(prsValue) ? Effect.fail(error) : Effect.void))),
				make(`${LEGACY_ENV_PREFIX}${name}`),
			]).pipe(Config.map(([, value]) => value)),
		),
	)
