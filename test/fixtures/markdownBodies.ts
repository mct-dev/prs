// Generic comment bodies shaped like common bot and reviewer output. No real
// repository, product, or person content.

export const botSuggestionBody = `<!-- review-bot:start -->
### Suggested change

<details>
<summary>Proposed patch for <code>src/example/widget.ts</code></summary>

\`\`\`diff
@@ -10,7 +10,8 @@ export const widget = () => {
-  const total = items.length
+  const total = items.filter(Boolean).length
+  if (total === 0) return null
   return render(total)
 }
 const a = 1
 const b = 2
 const c = 3
\`\`\`

_Note: this diff was truncated to fit the comment limit._
</details>

- Keep the empty check before rendering
- Consider a test for the **empty** case
  - nested detail with \`inline code\`

<!-- review-bot:end -->
📝 Summary generated for [the linked change](https://example.com/owner/repo/pull/42) &amp; related notes.

<img src="https://example.com/assets/preview.png" alt="preview screenshot" width="400">
`

export const linkbackBody = `<p>This change is part of a stack.</p>
<ul>
<li><b>#41</b> base change</li>
<li><a href="https://example.com/owner/repo/pull/42">#42</a> this change <i>(current)</i></li>
</ul>
<table><tr><th>Check</th><th>Status</th></tr><tr><td>lint</td><td>passed</td></tr></table>`

export const plainReviewBody = `Nit: rename \`count\` to \`itemCount\` for clarity.

1. first thing
2. second thing

- [x] done item
- [ ] open item

> quoted context line

~~old idea~~ **new idea** and *emphasis*.

---

| Name | Value |
|------|-------|
| alpha | 1 |
| beta | 22 |`

// A PR description shaped like the ones bots and templates produce: hidden
// summary marker, rules, GitHub alerts, bold section labels, `<sup>`, a
// `<picture>` badge (inline and multi-line) and a tool attribution footer.
export const prDescriptionBody = `<!-- SOME_BOT_SUMMARY -->
## Summary

Adds the widget cache. Fixes #123 and see \`src/cache.ts\`.

---

> [!NOTE]
> This PR depends on #120 landing first.

> [!WARNING]
> Breaking change for **alice**.

**Changes**

- Adds \`Cache.get\`
- Removes the old path<sup>1</sup>

<sup>Built by a bot</sup>

<a href="https://example.com/ci"><picture><source media="(prefers-color-scheme: dark)" srcset="https://example.com/dark.svg"><img src="https://example.com/light.svg" alt="Badge"></picture></a>

<a href="https://example.com/coverage">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://example.com/cov-dark.svg">
    <img src="https://example.com/cov-light.svg" alt="Coverage">
  </picture>
</a>

🤖 Generated with [Claude Code](https://example.com/claude-code)

https://example.com/code/session_abc
`
