# Cache v2: extension and observability

## Why

`plans/sqlite-cache.md` has shipped a v1 foundation: SQLite-backed queue snapshots and hydrated PR rows, opportunistic prune, `GHUI_CACHE_PATH=off` escape hatch, best-effort writes. That covers the highest-leverage caching but leaves real gaps:

- The biggest perceived latency (opening a PR diff) still hits the network every time.
- Per-repo metadata (labels, allowed merge methods) is fetched from cold every cold start.
- The user has no visibility into cache size and no in-app way to clear it.
- We have no operational signal that pruning works in real usage.

This plan captures the **audit-driven** follow-ups so v1 can bake without us forgetting what's next.

## Audit summary (point-in-time, after v1 landed)

What's persisted today:

- Queue snapshots (`queue_snapshots` table, keyed by viewer + view).
- Hydrated PR rows (`pull_requests` table, one row per `repository#number`).
- Opportunistic pruning at 30-day cutoff inside `writeQueue`.
- Startup prune wired into `App.tsx` so cache stays bounded even in read-only sessions.

What still hits GitHub on every call:

| Data | Cost to fetch | Volatility | Invalidation key | Verdict |
|---|---|---|---|---|
| Diffs (`getPullRequestDiff`) | 10–500KB; large GraphQL | only on new commits | `headRefOid` | Highest-value cache. v2.0. |
| Repo labels | small but per-repo round trip | rare | `repository` + 24h TTL | Easy win. v2.0. |
| Repo merge methods | small | very rare (settings change) | `repository` + 7d TTL | Easy win. v2.0. |
| Issue comments | medium | per comment | none cheap | Defer. |
| Review comments | medium | per comment | none cheap | Defer. |
| Merge info | small but volatile | high | none reliable | Don't cache. |
| Authenticated user | one call per process | none | n/a | Don't cache. |

Safety/lifecycle gaps still open:

1. **No size cap, no `VACUUM`.** After 30-day deletes, the file holds whitespace. Not urgent (months at realistic usage) but worth a `PRAGMA auto_vacuum = INCREMENTAL` future migration.
2. **No user-facing `--cache-info` / `--cache-clear`.** The escape hatch today is `rm ~/.cache/ghui/cache.sqlite`. Workable, rough.
3. **Pruning is silent.** No telemetry, no flash notice. If it ever deletes too aggressively, we won't know.

## What we'd ship

### v2.0 — diff cache + cheap per-repo metadata

1. **Diff cache by revision.** New table `diff_cache(pr_key, head_ref_oid, patch, fetched_at, primary key (pr_key, head_ref_oid))`. `loadPullRequestDiff` reads the cached patch first, applies it immediately, then revalidates.
2. **Repo labels persistence.** New table `repo_metadata_cache(repository, kind, data_json, fetched_at, primary key (repository, kind))` with `kind = 'labels'`. 24h TTL on read. Populates `labelCacheAtom` on startup.
3. **Repo merge methods persistence.** Same `repo_metadata_cache` table with `kind = 'merge_methods'`. 7d TTL on read.
4. **Diff prune.** Extend `pruneSql` to drop diff rows whose `fetched_at` is older than 7 days OR whose `pr_key` no longer exists in `pull_requests`. Keeping at most ~3 revisions per PR is nice-to-have but skip in v2.0.
5. **Migration:** `002_diff_and_metadata_cache` adds `diff_cache` and `repo_metadata_cache` tables.

### v2.1 — observability and operator ergonomics

1. **`ghui --cache-info`.** Print path, total file size, per-table row count, last prune time. Reuses the existing `CacheService` runtime; fails closed (prints "cache disabled") if `GHUI_CACHE_PATH=off`.
2. **`ghui --cache-clear`.** Best-effort `DELETE FROM` each cache table inside one transaction, then `VACUUM`. Confirm with `--yes` to make scripting safe.
3. **Last-prune metadata.** Track `last_pruned_at` in a small `cache_meta(key, value)` table so `--cache-info` shows it and `prune()` can throttle itself (skip if pruned within 1h).

### v2.2 — comments cache (only if latency becomes annoying)

Deferred. Would mirror `sqlite-cache.md`'s v1.1 plan: issue comments by PR, review comments by `(pr_key, head_ref_oid)`. Always revalidate on selection. Skip until usage shows it matters.

## API / architecture mapping

### Diff cache

Add to `CacheService`:

```ts
readonly readDiff: (key: PullRequestCacheKey, headRefOid: string) => Effect.Effect<string | null, CacheError>
readonly writeDiff: (key: PullRequestCacheKey, headRefOid: string, patch: string) => Effect.Effect<void>
```

Wire into `App.tsx`:

- `readDiffCacheAtom` and `writeDiffCacheAtom` siblings to existing `readCachedPullRequestAtom` / `writeCachedPullRequestAtom`.
- Diff load path: read cached patch first, apply to `pullRequestDiffCacheAtom`, kick off network revalidation in parallel. Replace memory + persist on success.
- Persist only on successful network response, not on cache hit, to avoid amplification.

### Repo metadata

```ts
readonly readRepoMetadata: (repository: string, kind: "labels" | "merge_methods") => Effect.Effect<{ readonly fetchedAt: Date; readonly data: unknown } | null, CacheError>
readonly writeRepoMetadata: (repository: string, kind: "labels" | "merge_methods", data: unknown) => Effect.Effect<void>
```

`labels` data shape: `readonly PullRequestLabel[]`. `merge_methods`: `RepositoryMergeMethods`. Decode through the same Effect Schema codecs used in network parsers; on decode failure, treat as miss.

### Schema additions

```sql
create table diff_cache (
  pr_key text not null,
  head_ref_oid text not null,
  patch text not null,
  fetched_at text not null,
  primary key (pr_key, head_ref_oid)
);

create table repo_metadata_cache (
  repository text not null,
  kind text not null,
  data_json text not null,
  fetched_at text not null,
  primary key (repository, kind)
);

create table cache_meta (
  key text primary key,
  value text not null
);
```

Foreign-key cascade isn't necessary; pruning by `pr_key NOT IN (SELECT pr_key FROM pull_requests)` is fine and matches existing patterns.

## Open questions

1. **Diff size cap.** Should we refuse to cache diffs larger than X KB to bound DB growth? Lean: log + skip when patch > 2 MB. Decide after observing real sizes for a week.
2. **Per-PR diff revision retention.** Keep last N revisions for navigation through commit history? Lean: no. Latest revision only; old ones are pruned. We can revisit when "compare to previous push" becomes a feature.
3. **`--cache-clear` granularity.** All-tables nuke vs. per-kind (`--clear-diffs`, `--clear-queues`)? Lean: nuke only, simplicity wins until someone asks.
4. **`KeyValueStore.layerSql` for `cache_meta`.** Worth using vs. hand-rolling? Lean: hand-roll; the table is tiny and avoids dragging another layer through the dependency graph.
5. **`auto_vacuum`.** Set `PRAGMA auto_vacuum = INCREMENTAL` in v2.0 migration so future `incremental_vacuum` calls actually shrink the file. Cannot enable on an existing DB without a `VACUUM` migration. Lean: ship in v2.1 alongside `--cache-clear` so the operation has a UI surface that justifies the migration cost.

## Out of scope (still)

- Offline write queueing.
- Cross-process invalidation.
- Cache inspection TUI.
- Full-text search over cached PRs/comments.
- Sharing cache across GitHub hosts/auth contexts.

## Status

Not started. v1 foundation (`sqlite-cache.md`) is shipped; let it bake on the maintainer's machine for 1–2 weeks before starting v2.0. Bake means: real PR review sessions, occasional offline use, occasional refresh-after-deploy. If the cache file grows in a way that surprises us or pruning misbehaves, fix that *before* adding more tables.
