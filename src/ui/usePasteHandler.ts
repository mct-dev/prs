import type { PasteEvent } from "@opentui/core"
import { useEffect, useRef } from "react"

interface KeyInputPasteEvents {
	on: (event: "paste", handler: (event: PasteEvent) => void) => void
	off: (event: "paste", handler: (event: PasteEvent) => void) => void
}

interface RendererLike {
	readonly keyInput: unknown
}

export interface UsePasteHandlerInput {
	readonly renderer: RendererLike
	readonly onPaste: (text: string) => boolean
}

const decodeText = (event: PasteEvent) => new TextDecoder().decode(event.bytes)

/**
 * Subscribes to terminal paste events and routes them through onPaste.
 * onPaste returns true if it handled the paste (suppressing default).
 *
 * Uses a ref for onPaste so callers can pass closures over current state
 * without forcing the effect to resubscribe on every render.
 */
export const usePasteHandler = ({ renderer, onPaste }: UsePasteHandlerInput): void => {
	const onPasteRef = useRef(onPaste)
	onPasteRef.current = onPaste

	useEffect(() => {
		const handlePaste = (event: PasteEvent) => {
			if (onPasteRef.current(decodeText(event))) event.preventDefault()
		}
		const keyInput = renderer.keyInput as KeyInputPasteEvents
		keyInput.on("paste", handlePaste)
		return () => {
			keyInput.off("paste", handlePaste)
		}
	}, [renderer])
}
