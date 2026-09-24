import { useAtomSet } from "@effect/atom-react"
import { useEffect, useRef } from "react"
import { noticeAtom } from "./atoms.js"

const NOTICE_TIMEOUT_MS = 2500

export const useFlashNotice = (): ((message: string) => void) => {
	const setNotice = useAtomSet(noticeAtom)
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		},
		[],
	)

	return (message: string) => {
		if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		setNotice(message)
		timeoutRef.current = globalThis.setTimeout(() => {
			setNotice((current) => (current === message ? null : current))
		}, NOTICE_TIMEOUT_MS)
	}
}
