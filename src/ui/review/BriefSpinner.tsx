import { fitCell } from "../primitives.js"
import { SPINNER_FRAMES } from "../spinner.js"
import { useSpinnerFrame } from "../useSpinnerFrame.js"

/**
 * Spinner frame for a running agent review. It owns its interval so a long
 * review re-renders only this span, not the app shell's loading indicator.
 */
export const BriefSpinner = ({ fg, suffix = "", width }: { readonly fg: string; readonly suffix?: string; readonly width?: number }) => {
	const frame = useSpinnerFrame({ active: true, reset: false })
	const text = `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!}${suffix}`
	return <span fg={fg}>{width === undefined ? text : fitCell(text, width, "right")}</span>
}
