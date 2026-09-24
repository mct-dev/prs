// Cap a record at `max` entries, dropping the OLDEST insertion-order keys.
//
// In long-lived TUI sessions, atom maps keyed by `pullRequestDiffKey(pr)` /
// PR url accumulate one entry per PR ever opened. Over days that grows
// unbounded. Applying `capRecord` at the loader sites (where new keys are
// added) keeps the working set bounded without losing recently-visited
// entries.
//
// Insertion order in JS object literals matches the ECMAScript "own
// property keys" iteration order: existing keys keep their position when
// re-assigned (`{ ...x, [k]: v }` with `k in x` doesn't move `k`), new keys
// append at the end. So "drop oldest first" is just "drop from the front
// of `Object.keys`", which is exactly LRU-by-first-insert. Not true LRU
// (we don't bump on access) but it's close enough for these caches and
// far cheaper than tracking access times.
export const capRecord = <T>(record: Record<string, T>, max: number): Record<string, T> => {
	const keys = Object.keys(record)
	if (keys.length <= max) return record
	const drop = keys.length - max
	const out: Record<string, T> = {}
	for (let i = drop; i < keys.length; i++) {
		const key = keys[i]!
		out[key] = record[key]!
	}
	return out
}
