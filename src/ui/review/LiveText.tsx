import { useEffect, useState } from "react"

export const LIVE_TEXT_INTERVAL_MS = 1000

/**
 * Text that re-renders itself once a second (e.g. an elapsed timer). It shows
 * the precomputed `text` until the first tick, so only this span updates.
 */
export const LiveText = ({
	text,
	fg,
	live,
	intervalMs = LIVE_TEXT_INTERVAL_MS,
}: {
	readonly text: string
	readonly fg: string
	readonly live: (now: Date) => string
	readonly intervalMs?: number
}) => {
	const [now, setNow] = useState<Date | null>(null)
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), intervalMs)
		return () => clearInterval(timer)
	}, [intervalMs])
	return <span fg={fg}>{now ? live(now) : text}</span>
}
