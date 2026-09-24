# Workspace Hub and Filters

## Why

The repository workspace changes ghui's center of gravity: when launched inside a GitHub repository, the app now starts in that repo's PR/issue workspace. That is useful for project work, but it removes the easy path back to the original cross-repository PR queue.

Users need a way to move between repo-scoped work and global work without restarting ghui, and they need filters that explain what list they are looking at.

## What we'd ship

- A workspace scope model: either `global` or `repository`.
- A lightweight hub opened by `esc` from the root workspace, or by a dedicated command-palette command.
- Repo-scoped filters for PRs and issues.
- Global PR filters that preserve the original ghui use case: review queue, authored PRs, assigned/review-requested PRs, etc.
- Global issue filters, likely starting with involved/assigned/created by me, depending on GitHub API cost and reliability.
- Header chrome that separates app status, workspace scope, and surface tabs instead of overloading the top row with the repo name.

## Mockups

### Repo Scope

The top row becomes app/status only. The second row carries the current scope and filter. Surface tabs stay below that.

```text
 ghui                                                                           updated Fri, 5/8 11:37 am
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 repo anomalyco/opencode        filter: open                                esc hub   f filters
──────────────────┬───────────┬─────────────────────────────────────────────────────────────────────────────
 PULL REQUESTS 50 │ ISSUES 50 │
──────────────────┴───────────┴───────────────────────────────────┬─────────────────────────────────────────
 · #26352 feat(acp): emit agent_error session/update when …  0d ✓ │ feat(acp): emit agent_error session/update
 · #26347 fix(tool/write): do not fail tool when post-writ…  0d ✓ │ #26352 by truenorth-lj · today  1 comment
```

### Global Scope

Global scope makes the old cross-repo PR workflow explicit. Repository grouping can remain in the list.

```text
 ghui                                                                           updated Fri, 5/8 11:37 am
────────────────────────────────────────────────────────────────────────────────────────────────────────────
 all repositories             filter: review requested                       esc hub   f filters
──────────────────┬───────────┬─────────────────────────────────────────────────────────────────────────────
 PULL REQUESTS 17 │ ISSUES 8  │
──────────────────┴───────────┴───────────────────────────────────┬─────────────────────────────────────────
 · ghui              #41 fix release smoke path                0d ✓ │ fix release smoke path
 · opencode          #26352 feat(acp): emit agent_error...     0d ✓ │ #26352 by truenorth-lj · today
 · effect-smol       #1180 improve Schema error messages       1d ◐ │ improve Schema error messages
```

### Hub

The hub is not a modal for every action; it is an escape hatch when the current repo scope is too narrow.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Workspace Hub                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  all repositories                                                           │
│    pull requests waiting on me                         17                   │
│    pull requests authored by me                        9                    │
│    issues involving me                                 8                    │
│                                                                              │
│  repositories                                                                │
│  › anomalyco/opencode                                  current              │
│    kitlangton/ghui                                    12 PRs   4 issues     │
│    Effect-TS/effect                                   31 PRs   9 issues     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ↑↓ move  enter open  / search  esc close                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Filters

Filters should be a small picker, not a text query language first. Query/search can come after the common filters are obvious.

```text
┌────────────────────────────────────────────────────────┐
│ Filters: anomalyco/opencode / Issues                  │
├────────────────────────────────────────────────────────┤
│ ✓ open                                                 │
│   assigned to me                                       │
│   created by me                                        │
│   commented by me                                      │
│   label: bug                                           │
│   label: enhancement                                   │
│   closed                                               │
├────────────────────────────────────────────────────────┤
│ ↑↓ move  enter apply  / search  esc close              │
└────────────────────────────────────────────────────────┘
```

## API / Architecture Mapping

- Add `WorkspaceScope`:
  - `user` with `viewer: string`
  - `repository` with `repository: string`
- Keep repo `WorkspaceSurface` as `pullRequests | issues`.
- Add user `WorkspaceSurface` as `repos | pullRequests | issues`.
- Add `WorkspaceFilter` or separate filter types:
  - PR global filters map to current queue views where possible.
  - PR repo filters map to repo-scoped `gh pr list` / GraphQL queries.
  - Issue repo filters map to `gh issue list --repo` plus optional labels/search terms.
  - Issue global filters likely require GraphQL search rather than iterating repos.
- Add repository navigation state:
  - favorite repositories
  - recent repositories
  - current repository when inside repo scope
- Add atoms for:
  - active workspace scope
  - active surface per scope
  - active filter per scope/surface
  - hub modal state
  - filter picker modal state
- Persist recent repositories and last used scope/filter after the UI shape stabilizes.
- Treat current git remote detection as the initial scope only, not a locked mode.

## Open Questions

- Should `esc` open the hub from the root workspace, or should it only clear/close UI state and use `h` / command palette for the hub?
- Should `esc` from repo scope go directly to user `REPOS`, or open a hub modal over the current repo?
- In global scope, should Issues mean "involving me" by default, or should we defer global issues until the API story is proven?
- Should repo filters be per-surface tabs (`open`, `mine`, `closed`) or a single picker opened by `f`?
- Should the hub show counts immediately, or should it avoid expensive count queries and load counts lazily?
- Do filters belong right-aligned in the surface row, or in a small inline chip inside the list header?
- Should favorites be explicit with `f`, or inferred/pinned from recent usage first?

## Out of Scope (for v1)

- Arbitrary saved custom queries.
- Multi-select repository scopes.
- Actions/Releases surfaces.
- Full dashboard analytics or notifications.

## Status

Not started.
