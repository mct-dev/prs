// Recent `/` filters, newest first, kept in `recent-filters.json` next to
// config.json. Best effort: a missing or broken file is just "no recents".

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { configPath } from "../themeStore.js"

export const maxRecentFilters = 10

export const recentFiltersPath = () => join(dirname(configPath()), "recent-filters.json")

/** Move `query` to the front, dropping duplicates and blanks, capped at `max`. */
export const pushRecentFilter = (recent: readonly string[], query: string, max = maxRecentFilters): readonly string[] => {
	const trimmed = query.trim()
	if (trimmed.length === 0) return recent
	return [trimmed, ...recent.filter((entry) => entry !== trimmed)].slice(0, max)
}

export const parseRecentFilters = (text: string): readonly string[] => {
	try {
		const value = JSON.parse(text) as unknown
		if (!Array.isArray(value)) return []
		return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).slice(0, maxRecentFilters)
	} catch {
		return []
	}
}

export const readRecentFilters = (path = recentFiltersPath()): readonly string[] => {
	try {
		return parseRecentFilters(readFileSync(path, "utf8"))
	} catch {
		return []
	}
}

export const writeRecentFilters = (recent: readonly string[], path = recentFiltersPath()): void => {
	try {
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, `${JSON.stringify(recent, null, "\t")}\n`)
	} catch {
		// Recents are a convenience; never surface a write failure.
	}
}
