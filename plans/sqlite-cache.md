# SQLite cache backend

## Why

ghui currently keeps pull request queues, hydrated details, comments, diffs, labels, and merge metadata in memory-only atoms. That gives good intra-session navigation, but every fresh launch starts cold and every network failure leaves the UI with no durable fallback.

The SQLite cache should make ghui feel local-first without pretending cached GitHub data is authoritative: show useful stale data immediately, refresh in the background, and update or discard cached records when GitHub confirms newer state.

## What we'd ship

1. **Warm startup from disk** — the current view opens from the last successful cache snapshot before GitHub returns.
2. **Stale-while-revalidate queues** — cached queues render with their last `fetchedAt`, then the existing GitHub refresh path replaces them when network data arrives.
3. **Persistent hydrated PR details** — once details/body/checks/labels are fetched for a PR, future launches can render details immediately while rehydrating in the background.
4. **Persistent comments cache (v1.1)** — details previews and the comments view can use cached issue/review comments, then refresh the combined comments stream when opened.
5. **Optional persistent diff cache (v1.2)** — diffs can be cached by `repository + number + headRefOid` so stale diffs never cross commits.
6. **Best-effort writes** — cache failures never block GitHub reads/writes or UI updates; they only degrade to current behavior.
7. **Manual escape hatch** — `GHUI_CACHE_PATH` can point at an alternate database, and `GHUI_CACHE_PATH=off` (or equivalent) can disable persistence if we choose that spelling.

## Phasing

1. **v1 foundation: queues + hydrated details**
   - Add Effect SQLite dependency, config, migrations, and `CacheService.disabledLayer` fallback.
   - Read active queue snapshots from disk only after the viewer scope is known for user-scoped views.
   - Persist fresh queue snapshots and hydrated PR details after GitHub success.
   - Add cached-stale status semantics so cached rows remain usable if network refresh fails.
2. **v1.1 comments**
   - Cache issue comments by PR and review comments by PR revision.
   - Always revalidate comments when a PR is selected/opened, even if cache hydration populated memory.
   - Persist only server-confirmed comment mutations, never optimistic local rows.
3. **v1.2 diffs and side metadata**
   - Cache diffs by `pr_key + headRefOid` after pruning is proven.
   - Add repo metadata caches only if labels/merge-method calls become a measurable bottleneck.

## API / architecture mapping

### Current state to preserve

- `queueLoadCacheAtom` stores `PullRequestLoad` by `viewCacheKey(view)`.
- `mergeCachedDetails` preserves hydrated detail fields when fresh summary pages arrive.
- `pullRequestCommentsAtom` stores combined issue + review comments by `pullRequestDiffKey(pullRequest)`.
- `pullRequestDiffCacheAtom` stores parsed diff state by `pullRequestDiffKey(pullRequest)`.
- `labelCacheAtom` and `repoMergeMethodsCacheAtom` store repository-scoped metadata.
- `GitHubService` remains the source of truth and should not learn about persistence.

### Effect SQL pieces to use

Use the current Effect SQL stack from `/Users/kit/code/open-source/effect-smol` rather than wrapping `bun:sqlite` directly:

- `@effect/sql-sqlite-bun/SqliteClient.layer({ filename })` provides both `SqliteClient` and the generic `effect/unstable/sql/SqlClient`.
- `@effect/sql-sqlite-bun/SqliteMigrator.layer({ loader })` runs migrations through `effect/unstable/sql/Migrator`; prefer `Migrator.fromRecord` for bundled in-source migrations.
- `SqlClient.withTransaction(...)` should wrap multi-table updates like writing PR records plus a queue snapshot.
- `sql.insert(rows)` plus SQLite `ON CONFLICT ... DO UPDATE` gives batch upserts without one statement per row.
- `sql.withoutTransforms()` is useful for persistence internals when we store raw JSON/text and do not want row-name transforms.
- `SqliteClient` already serializes access with a semaphore and enables WAL by default, so do not add a second ad-hoc write lock unless a concrete bug appears.
- Use `Clock`/Effect time where practical inside the cache service so TTL/prune behavior can be tested.
- Add `@effect/sql-sqlite-bun` as a runtime dependency, version-aligned with the repo's `effect` beta.
- On connection/migration startup, set conservative SQLite pragmas explicitly: `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`, `temp_store = MEMORY`, and a bounded `journal_size_limit`. WAL is already enabled by `SqliteClient`, but spelling out the other settings makes behavior predictable.

Effect persistence helpers are useful, but only for the right shape:

- `KeyValueStore.layerSql({ table })` + `KeyValueStore.toSchemaStore(...)` is good for simple typed blobs like small app preferences or maybe repo metadata caches.
- `Persistence.layerSql` and `PersistedCache.make(...)` are good for request-shaped TTL caches where a miss should execute a lookup and store the `Exit`.
- ghui's core queue cache needs ordered snapshots, queryable PR rows, pruning, and stale-while-revalidate UI semantics, so implement it as a domain-specific `CacheService` over `SqlClient`, not only as key/value blobs.
- `SqlResolver.findById` / `SqlResolver.grouped` can batch concurrent row reads if we later split cache reads into many per-PR requests. For v1, explicit bulk reads with `WHERE id IN (...)` are simpler.

### New service

Add a cache service alongside `GitHubService`, wired into `githubRuntime`:

```ts
type CacheViewer = string

export class CacheService extends Context.Service<CacheService, {
  readonly readQueue: (viewer: CacheViewer, view: PullRequestView) => Effect.Effect<PullRequestLoad | null, CacheError>
  readonly writeQueue: (viewer: CacheViewer, load: PullRequestLoad) => Effect.Effect<void, never>
  readonly readPullRequest: (key: PullRequestCacheKey) => Effect.Effect<PullRequestItem | null, CacheError>
  readonly upsertPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, never>
  readonly readComments: (prKey: PullRequestCacheKey, headRefOid: string) => Effect.Effect<readonly PullRequestComment[] | null, CacheError>
  readonly writeComments: (prKey: PullRequestCacheKey, headRefOid: string, comments: readonly PullRequestComment[]) => Effect.Effect<void, never>
  readonly readDiff: (key: PullRequestCacheKey, headRefOid: string) => Effect.Effect<string | null, CacheError>
  readonly writeDiff: (key: PullRequestCacheKey, headRefOid: string, patch: string) => Effect.Effect<void, never>
  readonly prune: () => Effect.Effect<void, never>
}>()("ghui/CacheService") {}
```

Implementation layer: `CacheService.layerSqlite`, depending on `SqlClient.SqlClient` and using Effect SQL template statements internally. Move the current local `PullRequestLoad` interface out of `App.tsx` or define a cache-specific DTO so the service is not coupled to component-local types.

### Config and boot behavior

- Default path: `GHUI_CACHE_PATH` if set, otherwise `${XDG_CACHE_HOME:-~/.cache}/ghui/cache.sqlite`.
- Disable path: `GHUI_CACHE_PATH=off` should provide `CacheService.disabledLayer` and should not create directories.
- Create the parent directory lazily before opening SQLite.
- If opening SQLite, applying pragmas, or running migrations fails, fall back to `disabledLayer` and keep the app booting with the current network-only behavior.
- Expose cache failures only as low-priority diagnostics/logs unless a read miss changes visible UI behavior; never turn cache boot failure into an app error screen.

Runtime layer sketch:

```ts
const cacheSqlLayer = SqliteClient.layer({ filename: config.cachePath })
const cacheMigrationsLayer = SqliteMigrator.layer({ loader: Migrator.fromRecord(cacheMigrations) })
const cacheLayer = Layer.mergeAll(cacheMigrationsLayer, CacheService.layerSqlite).pipe(
  Layer.provide(cacheSqlLayer),
)
```

Fallback layer: `CacheService.disabledLayer`, returning cache misses and ignoring writes. Use it when the DB cannot open or persistence is disabled.

### Cache keys

- `viewer`: authenticated username, once known. If missing, use `anonymous` only for non-user-specific repository views.
- `view_key`: existing `viewCacheKey(view)` plus viewer where queues are user-scoped.
- `pr_key`: `repository + "#" + number` as the stable PR identity.
- `revision_key`: `pr_key + ":" + headRefOid` for diffs and any line-position-sensitive review data.

### SQLite schema sketch

```sql
create table cache_meta (
  key text primary key,
  value text not null
);

create table pull_requests (
  pr_key text primary key,
  repository text not null,
  number integer not null,
  url text not null,
  head_ref_oid text not null,
  state text not null,
  detail_loaded integer not null,
  data_json text not null,
  updated_at text not null
);

create table queue_snapshots (
  viewer text not null,
  view_key text not null,
  view_json text not null,
  pr_keys_json text not null,
  fetched_at text not null,
  end_cursor text,
  has_next_page integer not null,
  primary key (viewer, view_key)
);

create table issue_comments_cache (
  pr_key text primary key,
  data_json text not null,
  fetched_at text not null
);

create table review_comments_cache (
  pr_key text not null,
  head_ref_oid text not null,
  data_json text not null,
  fetched_at text not null,
  primary key (pr_key, head_ref_oid)
);

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
```

Normalize queue membership by storing PR records once and snapshot order separately. This avoids duplicating full PR JSON across every queue while preserving exact list order.

Migration loader sketch:

```ts
const cacheMigrations = {
  "001_initial_cache_schema": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE IF NOT EXISTS pull_requests (...)`
    yield* sql`CREATE TABLE IF NOT EXISTS queue_snapshots (...)`
    yield* sql`CREATE TABLE IF NOT EXISTS issue_comments_cache (...)`
    yield* sql`CREATE TABLE IF NOT EXISTS review_comments_cache (...)`
    yield* sql`CREATE TABLE IF NOT EXISTS diff_cache (...)`
    yield* sql`CREATE TABLE IF NOT EXISTS repo_metadata_cache (...)`
  }),
}
```

Use real statements in code, not string concatenation. Table identifiers should go through `sql("table_name")`; values should be interpolated as `${value}`.

### Batching and transactions

- Queue write: inside `sql.withTransaction`, upsert all `pull_requests` with one `sql.insert(rows)` statement, then upsert the `queue_snapshots` row.
- Detail write: upsert one `pull_requests` row with `detail_loaded = 1`; do not rewrite every queue snapshot that contains it.
- Queue read: read the snapshot, parse `pr_keys_json`, then bulk-read PR rows by key and reconstruct the saved order.
- Comments write: store issue comments by `pr_key` and review comments by `(pr_key, head_ref_oid)`, then merge/sort on read. Review comments are line/revision-sensitive; issue comments are not.
- Repo metadata: either use `repo_metadata_cache` directly or a `KeyValueStore.toSchemaStore` over `KeyValueStore.layerSql({ table: "ghui_kv_cache" })`; pick one, do not maintain both.
- Avoid `SqlResolver` until a real N+1 cache-read shape appears. The app currently has explicit places to bulk-read queues, comments, and diffs.

### UI/data flow

1. On startup, read the selected view's `queue_snapshot` and populate `queueLoadCacheAtom` before or alongside the network request.
2. Keep the existing GitHub fetch path. When it succeeds, merge details via `mergeCachedDetails`, update atoms, then write the queue snapshot and PR records.
3. If a network refresh fails while cached queue data exists, keep cached rows visible and show the error as a notice or secondary stale state instead of replacing the list with only an error row.
4. `hydratePullRequestDetails` first checks cached full details for the PR. If available, apply them immediately, then still fetch GitHub details and update both memory and SQLite. A disk-hydrated `detailLoaded` value must not suppress revalidation.
5. `loadPullRequestComments` first checks comment cache; if available, set the comments atom as ready/stale, then still refresh from GitHub and replace. A disk-hydrated ready status must not suppress revalidation.
6. `loadPullRequestDiff` first checks `diff_cache` by `headRefOid`; if present, parse and show it immediately, then refresh when `force` is requested or the cache is stale.
7. Mutations update memory first as they do today. On success, persist the final server-returned state. On failure, revert memory and skip persistence.

### Staleness and pruning

- Cache entries can render regardless of age, but the footer/header should continue showing the last `fetchedAt` so stale state is visible.
- Always revalidate queues on launch/focus using the existing refresh cadence.
- Prefer lazy expiration at read time plus opportunistic pruning on startup or after successful queue writes. This avoids turning every read into a cleanup write.
- Prune old closed/merged PRs and old diff revisions opportunistically after successful queue writes.
- Suggested defaults: keep queue snapshots for 30 days, comments/details for 30 days, diffs for 7 days or last 3 revisions per PR.

### Serialization and validation

- Cached `PullRequestItem` and comment JSON must revive `Date` fields (`createdAt`, `closedAt`) before reaching UI code.
- Decode cached JSON through Effect Schema or explicit domain codecs. On decode failure, treat the row as a miss and delete or prune it later.
- Never let malformed cache rows fail the GitHub-backed app path.
- Do not persist optimistic local rows such as `local:*` comment ids. Persist only server-confirmed objects returned by GitHub.

### Testing

- Unit-test `CacheService` against a temp SQLite DB: migrations, idempotency, queue ordering, transaction rollback, corrupt JSON rows, date revival, pruning, disabled layer.
- Test viewer scoping with two users in the same DB; user-scoped queues must never cross viewer boundaries.
- Test stale-while-revalidate flows: cached queue renders immediately, GitHub success replaces it, GitHub failure keeps cached rows visible with stale timestamp.
- Test detail/comment revalidation after disk hydration so `detailLoaded` or `commentsLoaded = ready` does not suppress fresh GitHub requests.
- Test mutation failure paths leave SQLite unchanged; success paths persist only final server objects.
- Add release/package smoke coverage that opens a temp SQLite DB and runs migrations, because current `--version` smoke exits before app/runtime import.

### PR #16 mapping

PR #16 is useful as a seed, but too thin to merge as-is:

- It adds `GHUI_CACHE_PATH` and a raw `SqliteCacheService`.
- It stores a single scoped list of PR JSON.
- It does not wire the service into `App`, `Atom.runtime`, queue hydration, detail hydration, comments, or tests.

Use the PR as contributor context, but implement the production shape above in smaller commits.

## Open questions

1. **Diff cache in v1 or v1.1?** Diffs are easy to key by `headRefOid` but can grow the DB quickly. Lean: implement queue/details first, comments in v1.1, then diffs once pruning exists.
2. **Disable spelling.** `GHUI_CACHE_PATH=off` is convenient, but a separate `GHUI_CACHE=0` may be clearer.
3. **Stale labeling.** We can avoid new UI by relying on existing `fetchedAt`, or add a small `cached`/`refreshing` label in headers. Lean: reuse `fetchedAt` for v1.
4. **Schema validation.** Cached JSON should be decoded through the same domain parsing helpers where practical. If the shape fails, drop that row and treat it as a miss.
5. **Viewer scoping.** User queues must be viewer-scoped; explicit repository views could be shared across viewers. Lean: include viewer everywhere first for safety and do not hydrate user queues until viewer is known.
6. **Persistence helpers vs custom SQL.** Lean: custom SQL for queues/details/comments/diffs, `KeyValueStore.layerSql` only for simple side caches if it meaningfully reduces code.

## Out of scope (for v1)

- Offline write queueing for comments/reviews/merge actions.
- Cross-process cache invalidation.
- A cache inspection UI.
- Full-text search over cached PRs/comments.
- Sharing one cache between different GitHub hosts or auth contexts.

## Status

v1 foundation **shipped** (`24477aa Cache: SQLite-backed pull request and queue cache (foundation)`, `4cb2095 Details: comments summary in header + Markdown polish + cache wiring`). Startup prune wired in to keep the cache bounded for read-only sessions.

Comments, diffs, and per-repo metadata persistence are now tracked in [`cache-v2.md`](./cache-v2.md). Bake v1 on the maintainer's machine for 1–2 weeks before starting v2.
