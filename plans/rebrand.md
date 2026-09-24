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

Every line mentioning `ghui` (case-insensitive) on `main` at 652cc34, outside
`plans/` and `bun.lock`: 212 lines.

| Category | Lines | Examples | Action |
| --- | --: | --- | --- |
| User-visible | 19 | boot hints, "Quit ghui", palette search hint, CLI help and did-you-mean, theme name, wordmark logo, debug log header, README config path | Changed to prs (0 left) |
| Config / env | 35 | `GHUI_*` reads in `index.tsx`, `config.ts`, `devLog.ts`, `observability.ts`, `themeStore.ts`, `runtime.ts`, `mockFixtures.ts`; `GHUI_BIN_PATH`; `package.json` scripts; `.env.example`; dev scripts | Now `PRS_*` with `GHUI_*` fallback |
| Internal, renamed | 6 | `addGhUiParsers`, `ghui.command.runProcess` span, `.ghui/` dev path, `flake.nix` description, a dev comment | Renamed |
| Internal, kept | 20 | service tags, link scheme, migrations table, theme id, mock repo | Left alone (see below) |
| `@prs/keymap` package | 67 | package files and imports | Left alone (see below) |
| Tests | 61 | `GHUI_*` env setup, theme id, fixtures | Left alone; they now cover the fallback |
| Attribution | 4 | README credits, CHANGELOG fork note, `AGENTS.md` (plus `LICENSE`) | Kept on purpose |

Older plans hold another 43 lines across 14 files. They are history and stay as
they are.

## Env var mapping

Any `GHUI_<NAME>` becomes `PRS_<NAME>`. When both are set, `PRS_` wins. That
includes `PRS_BIN_PATH` (the launcher's binary override), `PRS_CONFIG_DIR`,
`PRS_CACHE_PATH`, `PRS_PR_FETCH_LIMIT`, `PRS_DEBUG_LOG` and the `PRS_MOCK_*`
family. Two new ones, read the same way (so the `GHUI_` spelling works too):
`PRS_NO_ANIMATION=1` (still loading picture) and
`PRS_LOADING_ART=contours|plasma|torus` (for trying the art variants).

## Upgrade behavior

prs is not on npm, so `prs upgrade` never installs a package. From a source
checkout it runs `git -C <repo> pull --ff-only`, but only when the working tree
has no tracked changes, HEAD is on a branch, and that branch has an upstream.
Otherwise it prints the `git pull --ff-only` and `bun install` commands and
exits 1. It never resets, stashes or discards anything.

## What remains (deliberately)

- `@prs/keymap` workspace package and its imports (32 files). Renaming would
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
