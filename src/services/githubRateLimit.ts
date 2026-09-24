import { errorMessage } from "../errors.js"

export type GitHubRateLimitKind = "graphql" | "rest" | "secondary"

export const classifyGitHubRateLimit = (detail: string): GitHubRateLimitKind | null => {
	const text = detail.toLowerCase()
	if (text.includes("secondary rate limit") || text.includes("abuse detection")) return "secondary"
	if (text.includes("graphql_rate_limit") || text.includes("graphql rate limit")) return "graphql"
	if (text.includes("api rate limit already exceeded")) return text.includes("graphql") ? "graphql" : "rest"
	if (text.includes("rate limit exceeded")) return text.includes("graphql") ? "graphql" : "rest"
	return null
}

export const isGitHubRateLimitError = (error: unknown): boolean => {
	return classifyGitHubRateLimit(errorMessage(error)) !== null
}
