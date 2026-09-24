# Repository Workspace Home

## Why

ghui currently opens directly into pull request queues. That makes sense for the first mature workflow, but it hides the repository as the primary object and makes future Issues, Actions, and Releases surfaces feel bolted on.

When launched inside or pointed at a GitHub repository, ghui should feel like a project workspace: pull requests and issues first, releases/actions later.

## What we'd ship

- A repository-oriented shell with a second navigation bar for project surfaces.
- Initial surfaces: Pull Requests and Issues.
- Number keys switch surfaces: `1` Pull Requests, `2` Issues.
- `tab` / `shift-tab` cycle project surfaces instead of foregrounding queue terminology.
- Pull Requests reuses the existing list/detail implementation.
- Issues starts as a placeholder surface while the workspace model settles.

## API / Architecture Mapping

- Add a small workspace surface type (`pullRequests`, `issues`) and atom in `App.tsx`.
- Render a surface tab bar below the existing header.
- Keep the existing `PullRequestView` data path intact for the PR surface.
- Add a lightweight Issues placeholder component before adding `GitHubService` issue APIs.
- Later: introduce a repository detection/context model and persist per-repo surface/filter preferences.

### Pane Layout Extraction

The workspace shell is exposing repeated layout code that should become a small pane library instead of staying embedded in `App.tsx`:

- `PaneShell`: owns header rows, surface tabs, body, footer, and the divider rows between them.
- `SplitPane`: renders left/right panes and owns the top/bottom divider junction characters (`┬` / `┴`) plus the vertical separator.
- `PaneSection`: wraps pane content with standard padding/height semantics.
- `ListWithPreview`: composes a selectable list on the left and a detail/placeholder panel on the right.
- `ModalFrame` already has junction-row lessons; the same idea should be generalized so dividers never look detached.

The goal is for PRs, Issues, Actions, Releases, and future modals to ask for "split list/detail" or "single pane" rather than reimplementing border math, padding, and junctions by hand.

## Open Questions

- Should global/non-repo launch still default to authored PRs, or a global home dashboard?
- Should tab cycling switch only project surfaces, or should there be a separate shortcut for PR saved filters?
- What are the first useful issue filters: open/all, assigned to me, labels, author, search?

## Out of Scope (for v1)

- Full issue listing/details/comment flows.
- Persisted per-repo preferences.
- Automatic Git remote detection and startup repo context.
- Actions/Releases implementations.

## Status

In progress.
