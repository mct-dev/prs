export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

const SPINNER_FRAMES_PER_SECOND = 12
export const SPINNER_INTERVAL_MS = 1000 / SPINNER_FRAMES_PER_SECOND
