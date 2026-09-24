import { useEffect, useState } from "react"
import { SPINNER_INTERVAL_MS } from "./spinner.js"

export interface UseSpinnerFrameInput {
	readonly active: boolean
	readonly reset: boolean
}

export const useSpinnerFrame = ({ active, reset }: UseSpinnerFrameInput): number => {
	const [frame, setFrame] = useState(0)

	useEffect(() => {
		if (!active) return
		const interval = globalThis.setInterval(() => {
			setFrame((current) => current + 1)
		}, SPINNER_INTERVAL_MS)
		return () => globalThis.clearInterval(interval)
	}, [active])

	useEffect(() => {
		if (reset) setFrame(0)
	}, [reset])

	return frame
}
