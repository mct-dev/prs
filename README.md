# prs

Agent-assisted PR review in your terminal.

`prs` is a fork of [ghui](https://github.com/kitlangton/ghui) by Kit Langton. It keeps ghui's keyboard-driven PR list, details, and diffs, and adds what you need to review *other people's* PRs quickly:

- **Sections**: named, ordered groups of PRs (needs my review, my team's work, re-review, mine). Each one is defined by GitHub search plus client-side filters.
- **Filters**: a small query language over author, repo, size, age, CI, review state, file paths, and AI risk.
- **Agent review**: press one key to run your own local agent (Claude Code or Codex) with a skill you choose. It writes a structured risk brief.
- **Risk brief in the overview**: what changed, where to look, what is safe to skip, and open questions, cached per head commit.

The goal: you don't have to read the whole PR. Read what the brief says needs your eyes.

> Status: early and moving fast. See [`plans/agentic-review.md`](./plans/agentic-review.md).

## Install (from source)

Requires [Bun](https://bun.sh) and the GitHub CLI (`gh auth login`).

```bash
git clone https://github.com/mct-dev/prs.git
cd prs
bun install
bun link   # puts `prs` on your PATH
prs
```

Environment variables still use the `GHUI_` prefix inherited from upstream (for example `GHUI_PR_FETCH_LIMIT`). Config lives in `~/.config/prs/` and the cache in `~/.cache/prs/`, so `prs` and `ghui` can be installed side by side.

## Credits

Forked from [kitlangton/ghui](https://github.com/kitlangton/ghui) at `76c91b8` (v0.9.1), MIT licensed. See `LICENSE`. Upstream fixes are ported by hand.

## Configuration

- `GHUI_PR_FETCH_LIMIT`: max PRs fetched, defaults to `200`
- `GHUI_RUN_FETCH_LIMIT`: max workflow runs fetched per PR, defaults to `20`

Example:

```bash
GHUI_PR_FETCH_LIMIT=100 prs
```

You can also copy `.env.example` to `.env` and edit the values locally.

prs stores UI preferences in `config.json` under `GHUI_CONFIG_DIR` when set,
otherwise under the platform config directory. On Linux this is normally
`~/.config/ghui/config.json`.

Example:

```json
{
	"theme": "system",
	"systemThemeAutoReload": true,
	"showScrollbars": false
}
```

`systemThemeAutoReload` defaults to `false`. Set it to `true` to let external
theme reload signals update the active system theme palette while prs is
running.

Scrollable panes hide their scrollbar rails by default. Set `showScrollbars`
to `true` to display them while retaining the same keyboard and mouse scrolling
behavior.

### Open in editor

Press `e` on a pull request (in the list, detail, or diff view) to hand it off
to your editor. prs suspends the TUI, runs your command attached to the
terminal, and resumes when it exits.

Configure this in `config.json`:

```json
{
	"editorCommand": "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'",
	"repoPaths": {
		"mct-dev/prs": "~/code/prs",
		"my-org/*": "~/code/repos/my-org/*",
		":owner/:repo": "~/src/github.com/:owner/:repo"
	}
}
```

`repoPaths` maps a repository to a local clone, matched in order: an exact
`owner/repo` key, then an owner wildcard (`owner/*`, where `*` becomes the repo
name), then the generic `:owner/:repo` template. `~` expands to your home
directory.

`editorCommand` is a shell command template with these substitutions:

- `{{repo}}` — full `owner/repo`
- `{{owner}}`, `{{name}}`
- `{{number}}` — PR number
- `{{headRef}}` — PR head branch
- `{{baseRef}}` — base branch
- `{{author}}`
- `{{url}}`
- `{{repoPath}}` — resolved local path (requires a matching `repoPaths` entry)

If `editorCommand` is omitted, prs falls back to `$VISUAL`/`$EDITOR` opening
the resolved `repoPath`. Some common recipes:

```jsonc
// diffview.nvim: checkout the branch and diff against base
"editorCommand": "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'"

// octo.nvim: review via the GitHub API (no checkout)
"editorCommand": "tmux new-window -c {{repoPath}} 'nvim -c \":silent Octo pr edit {{number}}\"'"

// VS Code
"editorCommand": "code {{repoPath}}"
```

### Workflow runs

Press `a` on a pull request to open its **GitHub Actions runs** full-screen,
scoped to the PR's head commit:

- The runs list shows each workflow run with status, conclusion, duration, and age.
- `enter` drills into a run to see its jobs and steps; failing steps are easy to spot.
- `n` / `p` jump between failures, `enter` expands a step, `o` opens the run in your browser, `r` refreshes, and `esc` walks back out.

Requires the GitHub CLI (`gh`) the same as the rest of prs; nothing extra to configure.

### Agent review

prs can run a local coding agent (Claude Code or Codex) against a pull request
and show a short **risk brief** at the top of the details pane: a risk level, a
summary, and the files most worth your attention.

Open a PR's details and press `b`, or run **Run agent review** from the
command palette. **Cancel agent review** stops a running review. Briefs are
cached per head commit and marked `stale` after a force-push.

Configure it in `config.json` (all keys optional):

```json
{
	"review": {
		"default": "claude",
		"concurrency": 2,
		"timeoutMinutes": 20,
		"presets": {
			"claude": { "skill": "review", "model": null, "maxBudgetUsd": 3, "extraPrompt": "" },
			"codex": { "agent": "codex", "model": null, "extraPrompt": "" }
		}
	},
	"repoPaths": { ":owner/:repo": "~/src/github.com/:owner/:repo" }
}
```

When a `repoPaths` entry points at a local clone, the agent reviews a detached
git worktree at the PR head. prs removes that worktree when the run ends.
Without a clone it gets only the diff. `PRS_REVIEW_AGENT_BIN` overrides the
agent binary for every preset. Run logs are kept under the cache
directory in `runs/`.

Agent reviews are **read-only**. The agent never posts comments, approves
or pushes:

- Claude runs non-interactively with only Read, Grep and Glob. Bash, edit and
  write tools, web tools and subagents are denied outright. Deny rules win
  over any allow rules in your user settings. It loads your user skills but
  no project settings or MCP servers.
- The agent has no shell. prs pre-generates the diff, the commit log and
  the file list into `.prs-context/` inside the worktree.
- Codex runs in its `read-only` sandbox.
- Worktrees are created with git hooks disabled. PR refs are fetched into
  private `refs/prs/...` refs, which are deleted afterwards.
- prs only reads the agent's JSON output. Nothing is sent to GitHub.

## Sections & filters

When you launch prs outside a git repository, it opens the **sections** view. This view groups every open PR that needs you into sections. The queue modes are still one `tab` away. Inside a repo, the palette command `Show sections view` switches to sections.

Sections come from `~/.config/prs/sections.yaml` (override the path with `PRS_SECTIONS_PATH`). If the file is missing, the built-in defaults below apply. If it fails to parse or validate, prs shows the defaults with the error above them. Set `PRS_DEFAULT_VIEW=queue` to start on the authored queue instead.

```yaml
vars:
  # Optional. If unset, my_teams = every team from `gh api user/teams`.
  my_teams: [my-org/backend]
  bots: ["app/dependabot", "app/renovate", "app/github-actions"]

sections:
  - id: needs-me
    title: Needs my review
    query: "review-requested:{me} -author:{me} draft:false"
    exclude: "author:{bots}"          # negated onto every branch
  - id: rereview
    title: New commits since my review
    query: "reviewed-by:{me} -author:{me}"
    where: "me.reviewed and not me.reviewed_since_push"
  - id: team
    title: My team's work
    query: "team-authors:{my_teams} -author:{me}"
  - id: mine
    title: My PRs
    query: "author:{me}"
  - id: bots
    title: Bots
    any: ["review-requested:{me} author:{bots}"]
    collapsed: true
```

- Every query gets `is:pr is:open archived:false`. `{me}` is your login. A list var expands to repeated qualifiers, and `-author:{bots}` expands to repeated negated ones.
- `any:` runs one search per branch and merges the results. `exclude:` is negated onto every branch.
- `team-authors:org/team` expands to the team's members, which are cached for a day. Long author lists are split across several searches.
- A PR appears only in the first section it matches, unless that section sets `exclusive: false`.
- Optional keys per section: `where`, `sort` (`updated`, `size`, `age`, `risk`; a leading `-` means descending; default `-updated`), `limit` (default 50), `collapsed`, `exclusive`.
- Sections load four at a time and render from cache first. A section that fails shows its error and keeps the PRs it had last.
- `[` / `]` jump between sections, `z` collapses or expands the current section, and `Z` toggles all of them. You can also click a header.

The `/` filter (and `where:`) understands `field:value`, `-field:value`, and `field>N` / `<` / `>=` / `<=`. Anything else is free text, which is still ranked by match score. Tokens AND together. `where:` also accepts `and`, `or`, `not` and parentheses.

| Field | Meaning |
|---|---|
| `author`, `repo`, `draft`, `review:approved\|changes\|none` | PR metadata (`author:@me` works) |
| `label`, `size`, `files`, `file:glob`, `ci:pass\|fail\|pending\|none` | Need PR details; unknown until loaded |
| `age`, `idle` | Since created / updated, e.g. `idle>3d`, `age<2h`, `1w` |
| `risk`, `brief` | From agent briefs (unknown until those exist) |
| `me.reviewed`, `me.reviewed_since_push` | Whether you reviewed, and whether that review is on the current head |

A predicate on data that hasn't loaded yet counts as unknown, and unknown never hides a PR. For example, `author:alice size>400 fix` keeps alice's PRs that match "fix", including ones whose size isn't known yet.

## Keybindings

- `up` / `down`: move selection
- `k` / `j`: move selection
- `gg` / `G`: jump to first or last pull request
- `ctrl-u` / `ctrl-d`: page up or down
- `tab` / `shift-tab`: switch PR queue (outside a repo the cycle starts at sections; in a repo, at the repository view)
- `[` / `]`: jump between sections (or repository groups)
- `z` / `Z`: collapse or expand the current section / all sections
- `ctrl-p` / `cmd-k`: open the command palette
- `/`: filter
- `enter`: expand details; normal PR actions still work while details are expanded
- `esc`: return from expanded details, leave diff/comment mode, or close modal
- `r`: refresh
- `d`: view stacked diff for all changed files
- `a`: view this PR's GitHub Actions runs (jobs, steps, and failing logs)
- `b`: run an agent review (in the details view)
- `shift-r`: review or approve the selected pull request
- `up` / `down` / `pageup` / `pagedown`: move comment target while viewing a diff
- `enter`: open a commented diff line, or start a comment on an uncommented line
- `v`: start or clear a multi-line diff comment range
- `n` / `p`: jump between diff comment threads
- `f`: open the changed-files navigator while viewing a diff
- `left` / `right`: choose the deleted or added side while in split diff comment mode
- `[` / `]`: switch files while viewing or commenting on a diff
- `s`: toggle draft or ready-for-review state
- `m`: merge
- `x`: close with confirmation
- `t`: choose a fixed theme, including `System` to match your terminal colors; press `m` in the theme picker to follow the OS light/dark appearance with separate theme choices
- `l`: manage labels
- `o`: open PR in browser
- `e`: open PR in your editor (configurable; see `editorCommand` / `repoPaths`)
- `y`: copy PR metadata
- `q`: quit

Authored-only pull request views render compact one-line rows because the
author identity is implied by the active view. Mixed-author views continue to
show the author and branch metadata row.

Review submission:

- Press `shift-r` to open the review modal.
- Use `j` / `k` or `up` / `down` to choose Comment, Approve, or Request changes.
- Press `enter` to move to the optional summary area.
- Press `enter` again to submit, or `shift-enter` to insert a newline.
- Press `esc` from the summary to return to action selection; press `esc` from action selection to cancel.
