# Rebrand ghui → prs

## Why

prs started as a fork of ghui. The fork renamed the binary and the config and
cache paths, but "ghui" still showed up in the boot hints, the command palette,
the theme picker, the help text and the loading screen, and every env var was
still `GHUI_*`. That tells users they are running someone else's tool.

## What we'd ship

- User-visible strings say "prs": boot hints, palette entries, CLI help and
  errors, the theme name, the debug log session line, and trace span names.
- `PRS_*` env vars, with `GHUI_*` kept as a fallback. Every read goes through
  `src/env.ts` (`envVar` for plain reads, `envConfig` for Effect `Config`).
- `prs upgrade` fast-forwards a clean source checkout and prints instructions
  in every other case (see below).
- The loading screen draws abstract braille-dot art (`src/ui/loadingArt.ts`)
  instead of the ghui wordmark.

## Audit

Every `ghui` mention on `main` at 652cc34, by category.

| Category | Examples | Action |
| --- | --- | --- |
| User-visible | boot hints, "Quit ghui", palette search hint, CLI help and did-you-mean, theme name, wordmark logo, debug log header | Changed to prs |
| Config / env | `GHUI_*` reads in `index.tsx`, `config.ts`, `devLog.ts`, `observability.ts`, `themeStore.ts`, `runtime.ts`, `mockFixtures.ts`; `GHUI_BIN_PATH`; `package.json` scripts; `.env.example`; dev scripts | Now `PRS_*` with `GHUI_*` fallback |
| Internal, renamed | `addGhUiParsers`, `ghui.command.runProcess` span, `.ghui/` dev paths | Renamed |
| Internal, kept | see below | Left alone |
| Attribution | README credits, `LICENSE`, CHANGELOG fork note, `AGENTS.md` | Kept on purpose |

## Env var mapping

Any `GHUI_<NAME>` becomes `PRS_<NAME>`. When both are set, `PRS_` wins. That
includes `PRS_BIN_PATH` (the launcher's binary override), `PRS_CONFIG_DIR`,
`PRS_CACHE_PATH`, `PRS_PR_FETCH_LIMIT`, `PRS_DEBUG_LOG` and the `PRS_MOCK_*`
family. New, with no legacy name: `PRS_NO_ANIMATION=1` (still loading picture)
and `PRS_LOADING_ART=contours|plasma|torus` (for trying the art variants).

## Upgrade behavior

prs is not on npm, so `prs upgrade` never installs a package. From a source
checkout it runs `git -C <repo> pull --ff-only`, but only when the working tree
has no tracked changes, HEAD is on a branch, and that branch has an upstream.
Otherwise it prints the `git pull --ff-only` and `bun install` commands and
exits 1. It never resets, stashes or discards anything.

## What remains (deliberately)

- `@ghui/keymap` workspace package and its imports (32 files). Renaming would
  touch every keymap file and conflict with parallel work.
- `ghui/*` Effect service tags (`CommandRunner`, `CacheService`, …). Internal
  only; rename in a quiet week.
- `ghui://issue-ref/` inline link scheme. Internal only.
- `ghui_cache_migrations` table name. Renaming would re-run cache migrations.
- Theme id `"ghui"` and the `ghuiColors` palette. Saved configs store the id;
  users only see the name, which is now "prs".
- `kitlangton/ghui` mock repository and test fixtures.
- `GHUI_*` in tests. They now exercise the fallback path.
- `GHUI_` and ghui mentions in older plans. They are history.

## Open questions

- Drop the `GHUI_*` fallback after a release or two?
- Rename the service tags and the keymap package once the parallel branches land.

## Out of scope

- Publishing prs to npm.
- A new theme palette.

## Status

Done on `feat/brand`: env helper, user-visible strings, safe `prs upgrade`, and
the loading art (contours by default). The "What remains" list is still open.
