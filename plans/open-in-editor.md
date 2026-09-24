# Open PR in editor (Neovim, VS Code, …)

## Why

Today the only way out of ghui to inspect a PR is `o` (open in browser). Several
users (and gh-dash refugees) want to hand a PR off to their editor — most often
`nvim` with `diffview.nvim` / `octo.nvim`, but also `code .`, `zed`, etc.

gh-dash solves this with a generic *custom keybinding* mechanism: a key maps to
an arbitrary shell command template with `{{.RepoPath}}` / `{{.PrNumber}}` /
`{{.HeadRefName}}` substitution, and a `repoPaths` map from `owner/repo` to a
local clone directory. The "Neovim" part is entirely the user's command, e.g.:

```yaml
- key: c
  command: >
    tmux new-window -c {{.RepoPath}} '
      gh pr checkout {{.PrNumber}} &&
      nvim -c ":DiffviewOpen master...{{.HeadRefName}}"
    '
```

We adopt the same idea but make it first-class and ergonomic for ghui's
foreground TUI: a configurable command + a `repoPaths` map, launched by
**suspending the TUI, running the command attached to the real terminal, and
resuming** when it exits (the `git commit` opens `$EDITOR` model). This works
with or without tmux.

## What we'd ship

- A new `e` keybinding in the PR list, detail, and diff views: "Open in editor".
- A `pull.open-editor` command (in the command palette + bound to `e`).
- `config.json` additions:
  - `editorCommand`: a command template string (default sensible value).
  - `repoPaths`: a map of `owner/repo` / wildcard patterns → local directory.
- Substitution variables in the command template:
  - `{{repo}}` — full `owner/repo`
  - `{{owner}}`, `{{name}}`
  - `{{number}}` — PR number
  - `{{headRef}}` — PR head branch (`headRefName`)
  - `{{baseRef}}` — base branch (`baseRefName`)
  - `{{author}}`
  - `{{repoPath}}` — resolved local path (empty if no mapping matched)
  - `{{url}}`
- Launch by suspending the renderer, spawning the command in a shell attached to
  the inherited stdio, then resuming. Non-zero exit / spawn failure surfaces a
  notice/flash, never crashes the TUI.
- A clear error when the command references `{{repoPath}}` but no mapping matched.

## repoPaths matching (mirrors gh-dash)

Resolution order for `owner/repo`:

1. Exact full-name key (`dlvhdr/gh-dash: ~/code/gh-dash`).
2. Owner wildcard (`dlvhdr/*: ~/code/repos/dlvhdr/*`) — `*` expands to repo name.
3. Generic template (`:owner/:repo: ~/src/github.com/:owner/:repo`).

`~` expands to the home directory. Exact beats wildcard beats template.

## API / architecture mapping

- `src/editorCommand.ts` (pure): `resolveRepoPath(repoPaths, repo)` and
  `renderEditorCommand(template, fields)` → substituted command string.
  100% pure, fully unit-tested, no I/O.
- `src/themeStore.ts` (or a sibling `editorConfig.ts`): load `editorCommand` +
  `repoPaths` from `config.json`, same pattern as `loadStoredShowScrollbars`.
- `src/services/EditorOpener.ts`: Effect service mirroring `BrowserOpener`.
  `openPullRequestInEditor(pr)` → resolves template, suspends TUI, runs command,
  resumes. Has a `MockEditorOpener`/no-op for tests + mock mode.
- TUI suspension: `src/tuiSuspension.ts` exposes
  `setTuiSuspender(fn)` / `withTuiSuspended(fn)`. `index.tsx` registers a
  suspender backed by `renderer.suspend()` / `renderer.resume()`. The service
  calls `withTuiSuspended` so it never imports the renderer directly.
- `src/services/systemAtoms.ts`: `openInEditorAtom`.
- `src/commands/builtins.ts`: `pull.open-editor` command, `shortcut: "e"`,
  `scope: "Pull request"`, disabled when no PR selected.
- Keymap: add `openInEditor` to `listNav` (PR), `detailView`, and `diffView`
  contexts + their ctx builders, dispatching `pull.open-editor`.

## Launch mechanics

`renderer.suspend()` releases raw mode / alt-screen and `resume()` reacquires
them (confirmed in `@opentui/core` `renderer.d.ts`). The command runs via the
user's shell (`$SHELL -c "<rendered command>"`) with `stdio: "inherit"` so an
interactive `nvim` owns the terminal. On exit we resume and force a repaint.

If `editorCommand` is unset we fall back to `$EDITOR`/`$VISUAL` with the
resolved repo path (or a helpful notice telling the user to configure
`repoPaths` / `editorCommand`).

## Open questions

- Default `editorCommand`? Proposal: empty → use `$EDITOR`/`$VISUAL` opening the
  repoPath; document the diffview/octo recipes in the README rather than baking
  one in.
- Issues too? PR-first; an `issue.open-editor` can follow trivially.
- tmux convenience: keep it purely user-configurable for v1 (their command can
  start with `tmux new-window`); suspend/resume covers the common case.
- Should a missing `repoPath` block, or run anyway with empty? Block with a
  notice when the template references `{{repoPath}}` and nothing matched.

## Out of scope (for v1)

- A config UI/modal for editing `repoPaths` (hand-edit `config.json`).
- Multiple editor keybindings (gh-dash allows N custom keys); ship one `e`.
- Auto-checkout orchestration beyond what the user's command does.

## Status

Shipped (initial) — `e` opens the selected PR in a configurable editor command
(`pull.open-editor`), with `editorCommand` + `repoPaths` in `config.json`, TUI
suspend/resume, and `$EDITOR` fallback. Issue support + multiple custom keys
remain future work.
