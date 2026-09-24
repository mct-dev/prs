// URLs from comment bodies are untrusted. Only plain web links may reach the
// system opener or an OSC 8 hyperlink: no other schemes, no control
// characters, and nothing an opener could read as a command-line flag.
// oxlint-disable-next-line no-control-regex -- intentional: untrusted text is scrubbed of terminal controls
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

export const isSafeUrl = (url: string): boolean => {
	if (url.length === 0 || url.startsWith("-") || CONTROL.test(url)) return false
	try {
		const parsed = new URL(url)
		return parsed.protocol === "http:" || parsed.protocol === "https:"
	} catch {
		return false
	}
}
