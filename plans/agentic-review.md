# Agentic review

## Why

Reviewing other people's PRs takes too much reading. A reviewer rebuilds context, reads every file, and only then finds the two places that need judgment. ghui lists *my* PRs well, but it has no idea of "what needs my review", "what my team is shipping", or "which part of this diff matters".

Goal: open `prs`, see the right PRs grouped the right way, press one key to have a local agent study a PR, and read a short brief that says where to look and what to skip. Reviewing gets much faster and more pleasant.

## What we'd ship

1. **Sections**: named, ordered groups of PRs, each defined by GitHub search plus client-side filters. They replace the single "queue mode" list.
2. **Filter language**: `/` accepts tokens like `author:alice repo:web size>400 age>2d ci:fail risk>=medium file:migrations/**` plus free text. The same language is used for section `where:` rules.
3. **Agent review**: one key runs a configurable local agent + skill against the PR. The PR is checked out in an isolated git worktree and the run is read-only. The agent writes a **risk brief** in a fixed JSON schema.
4. **Brief in the overview**: the details pane shows risk, a one-line summary, and the top focus areas. A full view shows everything. Each brief is cached per head SHA and marked stale when new commits land.

## Sections

Config file: `~/.config/prs/sections.yaml`. Parsed with `Bun.YAML`. If the file is missing, built-in defaults apply.

```yaml
vars:
  # Optional. If unset, my_teams = all teams from `gh api user/teams`.
  my_teams: [my-org/backend]
  bots: ["app/dependabot", "app/renovate", "devin-ai-integration[bot]"]

sections:
  - id: needs-me
    title: Needs my review
    query: "review-requested:{me} -author:{me} draft:false"
    exclude: "author:{bots}"          # applied to EVERY branch
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

Rules:

- Every query gets `is:pr is:open archived:false` added. `{me}` means the viewer login.
- `any:` runs one search per branch and merges the results by PR id. GitHub search has no reliable OR for PRs.
- `exclude:` is added (negated) to every branch. This avoids a Graphite gotcha where the bot exclusion only applied to one OR branch.
- `team-authors:org/team` expands to `author:m1 author:m2 …` from `gh api orgs/{org}/teams/{team}/members`. Multiple `author:` terms OR together (verified). The member list is cached for a day. Do not use `team-review-requested` for "team's work": that means "PRs asking my team to review", not "PRs my team wrote".
- A list value inside `author:{bots}` expands to repeated qualifiers. With a leading `-` it expands to repeated negated qualifiers.
- **First match wins.** A PR appears only in the first section it matches, unless the section sets `exclusive: false`.
- Each section shows a header with its count. `[` / `]` jump between sections. Enter on a header collapses it.
- Optional per-section keys: `where`, `sort` (`updated`, `-updated`, `size`, `-risk`, `age`), `limit` (default 50), `collapsed`.

## Filter language

This replaces the substring scoring in `src/ui/filter/scoring.ts` and keeps the `filterByScore` contract: filtered PRs are still ranked by free-text score.

- `field:value`, `-field:value` (negate), `field>N`, `field<N`, `>=`, `<=`. Durations are written `2h`, `3d`, `1w`. Everything else is free text.
- Tokens combine with AND. In `where:` rules only, `and`, `or`, `not`, and parentheses are also allowed.
- Fields:

| Field | Meaning |
|---|---|
| `author`, `repo` (substring or `owner/name`), `label`, `draft` | PR metadata |
| `size` | additions + deletions |
| `files` | Count of changed files |
| `file:glob` | Needs details. Treated as unknown until they are loaded. |
| `age` | Since created |
| `idle` | Since updated |
| `ci:pass\|fail\|pending\|none` | Check rollup |
| `review:approved\|changes\|none` | Review state |
| `risk:low\|medium\|high` or `risk>=medium` | From the cached brief |
| `brief:none\|stale\|running\|done` | Brief status |
| `me.reviewed`, `me.reviewed_since_push` | `where:` only; needs review data |

- A predicate on a field that has not loaded yet evaluates as unknown, and the PR stays visible. A filter should never silently hide a PR.

## Agent review

### Config

In `~/.config/prs/config.json`:

```json
{
  "review": {
    "default": "claude",
    "concurrency": 2,
    "presets": {
      "claude": { "agent": "claude", "skill": "review", "model": null, "maxBudgetUsd": 3, "extraPrompt": "" },
      "codex": { "agent": "codex", "skill": null, "model": null }
    }
  }
}
```

`skill` is any skill name the local agent can resolve, for example `review`, `code-review`, or `my-plugin:review`. For Claude, the prompt starts with `/<skill>`. For Codex, the skill name is mentioned in the prompt.

### Run

1. Resolve the local clone through the existing `repoPaths`. Run `git fetch origin pull/<n>/head`, then `git worktree add --detach <cache>/prs/worktrees/<owner>-<repo>-<n>-<sha7> <sha>`, and reuse the worktree if it already exists. If there is no clone, fall back to **diff-only** mode: a temp directory containing `pr.diff` and `pr.json`.
2. Build the prompt. It contains the PR title, body, URL, base, head SHA, and changed-file list (all from data we already have), plus: "The PR is checked out in the current directory. Review it with the `<skill>` skill. Do not post comments, approve, push, or change files. Your final answer must match the JSON schema."
3. Spawn the agent with a new `AgentRunner` service: no 15s timeout, streamed stdout, cancellable, a global concurrency cap, and logs written to `<cache>/prs/runs/<id>.log`.
   - **claude:** `claude -p <prompt> --output-format json --json-schema <schema> --permission-mode dontAsk --allowedTools "Read Grep Glob Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git blame:*)" --max-budget-usd N [--model M]`. The result is `structured_output`.
   - **codex:** `codex exec -s read-only --output-schema <file> -o <out> -C <worktree> <prompt>`.
4. Validate the result against the schema, store it in SQLite (`agent_reviews` table: repo, number, head_sha, preset, status, brief_json, log_path, cost_usd, started_at, finished_at), and remove the worktree.

Read-only is a hard rule. The review must never post, approve, or push.

### Brief schema (fixed; any skill must produce it)

```ts
{
  risk: "low" | "medium" | "high",
  summary: string,                 // 1-2 sentences: what this PR does
  before_after?: string,           // behavior change in plain words
  focus_areas: { file: string, lines?: string, why: string, severity: "low"|"medium"|"high" }[],
  safe_to_skip: { path: string, why: string }[],   // path or glob
  questions: string[],             // judgment calls for the human
  tests?: string,                  // are the risky parts tested?
  confidence: "low" | "medium" | "high"
}
```

### UI

- **Key:** `b` on a PR runs the brief with the default preset. `B` opens a preset picker. The key must not already be bound; check the keymap. A command palette entry "Run agent review".
- **List glyph:** spinner while running. A risk dot colored low/med/high when done. A dim ring when the brief is stale. Nothing when there is no brief.
- **Details pane:** a "Risk brief" section after checks. It shows the risk, summary, and up to 3 focus areas with `file:lines`, plus a "+N more · stale since abc123" hint. Keep the layout height math in `computeDetailHeaderLayout` exact.
- **Full view:** all fields and a link to the run log. From a focus area, `enter` jumps to that file in the diff view.

## Out of scope (v1)

- Posting agent findings to GitHub. We may later draft comments into the queued review that you edit and submit yourself.
- Scheduled or automatic runs across whole sections (an opt-in per-section `auto_brief` comes later).
- Linear or ticket context in the brief (next: fetch the ticket so "solution fit" can be judged).
- Stacks and grouping by ticket.

## Open questions

- A cheap "triage" tier (a diff-only small-model brief on every PR in a section) vs. only on demand. Start on demand and measure cost and time.
- A shared team config: a repo-hosted `sections.yaml` people can import.
- Whether to show "why is this in my queue": a direct request, a team request, or code ownership.

## Status

In progress. Phases: 1 sections → 2 filters → 3 agent runner → 4 brief UI.
