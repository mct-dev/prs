import { useEffect, useRef, useState, type MutableRefObject } from "react"

interface RendererFocusEvents {
	on: (event: "focus" | "blur", handler: () => void) => void
	off: (event: "focus" | "blur", handler: () => void) => void
}

export interface UseTerminalFocusInput {
	readonly renderer: RendererFocusEvents
	readonly onFocusReturn: () => void
}

export interface UseTerminalFocusResult {
	readonly terminalFocused: boolean
	readonly terminalFocusedRef: MutableRefObject<boolean>
}

/**
 * Tracks terminal focus/blur, fires onFocusReturn when focus is regained
 * after a blur. Exposes both the reactive boolean and a ref so consumers
 * that need a stable read inside callbacks (without extra deps) can use
 * the ref form.
 */
export const useTerminalFocus = ({ renderer, onFocusReturn }: UseTerminalFocusInput): UseTerminalFocusResult => {
	const [terminalFocused, setTerminalFocused] = useState(true)
	const terminalFocusedRef = useRef(true)
	const wasBlurredRef = useRef(false)
	const onFocusReturnRef = useRef(onFocusReturn)
	onFocusReturnRef.current = onFocusReturn

	useEffect(() => {
		const handleFocus = () => {
			terminalFocusedRef.current = true
			setTerminalFocused(true)
			if (wasBlurredRef.current) onFocusReturnRef.current()
		}
		const handleBlur = () => {
			wasBlurredRef.current = true
			terminalFocusedRef.current = false
			setTerminalFocused(false)
		}
		renderer.on("focus", handleFocus)
		renderer.on("blur", handleBlur)
		return () => {
			renderer.off("focus", handleFocus)
			renderer.off("blur", handleBlur)
		}
	}, [renderer])

	return { terminalFocused, terminalFocusedRef }
}
