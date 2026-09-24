# Repository Notes

## Project

`prs` is a fork of kitlangton/ghui (v0.9.1, upstream SHA 76c91b8) focused on agent-assisted PR review. The main plan is `plans/agentic-review.md`.

- This repo is public. Never commit company-specific data: org or team names, real PR fixtures, channel IDs, or emails. Put personal sections in the user config (`~/.config/prs/`) and use `{me}` / `{my_teams}` placeholders in defaults.
- Agent review runs are read-only. They must never post comments, approve, or push.

## Commands

- Format check: `bun run format:check`.
- Typecheck: `bun run typecheck`.
- Lint: `bun run lint`.
- Test: `bun run test`.
- Package smoke: `bun run package:smoke`.

## Commit Readiness

- Before committing or pushing code changes, run `bun run format:check`, `bun run typecheck`, `bun run lint`, and `bun run test`.
- If formatting fails, run `bunx oxfmt src/ test/ dev/` or format only the touched files, then rerun `bun run format:check`.
- CI enforces formatting with `bun run format:check`; do not rely on manual review to catch formatting drift.

## UI Conventions

- Modal dividers must connect to the side borders with junction characters (`├` / `┤`). When adding a horizontal divider inside a modal body, thread the divider's row index through `ModalFrame`'s `junctionRows` so the side bars render `├`/`┤` at that row instead of `│`. Inline `<Divider>`s without a corresponding junction row look detached and are wrong.

## Plans

Larger features and redesigns are captured in markdown under `plans/` before work starts. Each plan has Why / What / API mapping / Open questions / Status. When taking on something non-trivial, check `plans/` first; when sketching a future-direction idea, write a plan there rather than only mentioning it in chat or commits. See `plans/README.md` for the format and index.

## Future Work

- Add a conversation panel focus/expand flow for reading and navigating longer PR conversations.
- Consider click-drag support in diffs to select a comment range.
- See `plans/` for tracked feature plans (e.g. queued PR reviews).
