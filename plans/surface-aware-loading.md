# Surface-Aware Loading and API Telemetry

## Why

ghui is growing from a single pull-request queue into a workspace with user and repository scopes. Loading pull requests unconditionally at startup is now the wrong abstraction: the visible surface might be the repository PR list, repository issues, the user repo hub, user PRs, or user issues.

The app should load only what the current surface needs, progressively hydrate richer data when panes become visible, and make GitHub API cost visible in local telemetry before rate limits are exhausted.

## What we'd ship

- Startup loads only the active scope/surface.
- List queries fetch cheap row fields only.
- Detail, comments, diff, labels, and checks load only when their pane or modal is visible.
- Cached visible data renders immediately while refresh happens in the background.
- Rate-limit failures do not retry with exponential backoff.
- Local-only API telemetry records each `gh` command's operation, endpoint/query kind, page size, retry count, duration, exit code, and rate-limit hints.
- Motel receives telemetry when `GHUI_MOTEL_PORT` or `GHUI_OTLP_ENDPOINT` is configured; otherwise no telemetry leaves the process.

## API / Architecture Mapping

- Introduce a surface-aware load model keyed by:
  - scope: `user` or `repository`
  - repository: `owner/name` when in repo scope
  - surface: `repos | pullRequests | issues`
  - filter/query state
  - page cursor
- Replace unconditional `pullRequestsAtom` reads in `App.tsx` with active-surface reads:
  - repo + pullRequests -> repo PR list atom
  - repo + issues -> repo issues list atom
  - user + repos -> repo hub atom
  - user + pullRequests -> user PR search atom
  - user + issues -> user issue search atom
- Split PR GraphQL fragments:
  - `PR_LIST_FIELDS_FRAGMENT`: cheap rows only.
  - `PR_DETAIL_FIELDS_FRAGMENT`: body, labels, stats, and optional checks.
- Keep `statusCheckRollup`, comments, review comments, and diffs out of list queries.
- Treat `GHUI_PR_PAGE_SIZE` as the first page size.
- Treat `GHUI_PR_FETCH_LIMIT` as a hard cap for pagination, not eager startup loading.
- Add a small GitHub API operation descriptor alongside command execution:
  - service label: `GitHubService.listRepositoryPullRequestPage`, `GitHubService.listUserPullRequestPage`, etc.
  - command kind: `graphql`, `rest`, `gh-pr`, `gh-issue`, `gh-label`
  - scope and surface when known
  - page size and cursor-present boolean, not raw cursor values
- Add Effect spans/logs around `CommandRunner.run` / `GitHubService` calls using existing `Observability.layer`.
- Add rate-limit classification for GitHub errors:
  - GraphQL rate limit
  - REST/core rate limit
  - secondary abuse/rate limit
  - generic command/schema/network failure
- Skip retry for classified rate-limit failures.

## Query Shape

### Repository Pull Requests

- Initial list: `repository.pullRequests(first: pageSize, orderBy: UPDATED_AT)`.
- Fields: number, title, url, author, repository, created/updated time, state/draft/review decision, branch names, commit oid, default branch.
- Detail hydration: selected PR only; body, labels, diff stats, checks.
- Comments/diff: pane-driven only.

### Repository Issues

- Initial list: bounded `gh issue list --repo <repo> --limit <pageSize>` or equivalent query.
- Fields: number, title, url, author, labels, comment count, created/updated time.
- Body/comments: detail/comments pane only.

### User Repo Hub

- Initial list comes from persisted favorites/recents plus a bounded viewer repository query.
- Counts are optional and should not block hub rendering.
- Repo activity/counts can hydrate progressively from cached PR/issue lists or cheap metadata.

### User Pull Requests

- One bounded search query for involved/review-requested/authored PRs.
- No per-repo fanout.
- Same cheap list fields as repository PRs.

### User Issues

- One bounded search query for assigned/involved/mentioned issues.
- No per-repo fanout.
- Same cheap list fields as repository issues.

## Open Questions

- Should the user repo hub query GitHub at startup, or start with cached favorites/recents and hydrate only after first paint?
- Should detail checks load automatically for the selected PR, or only when the detail pane has enough space to show them?
- Should background prefetch be disabled entirely after any rate-limit signal, or only for the affected bucket?
- Should API telemetry also be mirrored to a local file for sessions where Motel is not running?
- How much query-cost estimation should be local and static versus read from GitHub response headers/errors?

## Out of Scope (for v1)

- Full GraphQL cost prediction before every query.
- Multi-repository dashboard aggregations.
- Background refresh of hidden surfaces.
- Persisting raw telemetry in the app cache.

## Status

In progress. Shipped: cheap PR list fields, command timeout bounds, GitHub rate-limit classification, retry skipping for rate-limit and timeout failures, local command telemetry attributes, and startup failure visibility. Still pending: active-surface atom split, issue detail hydration, and user issue search without repo fanout.
