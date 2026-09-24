import { Context, Effect, Layer } from "effect"
import type { PullRequestItem } from "../domain.js"
import { isSafeUrl } from "../safeUrl.js"
import { CommandError, CommandRunner } from "./CommandRunner.js"

// `open` ships on macOS; `xdg-open` is the Linux/BSD convention. On Windows,
// `url.dll` opens the URL without going through `cmd`, whose metacharacter
// parsing (`&`, `|`, `^`) would otherwise treat parts of a URL as commands.
export const platformOpener = (platform: NodeJS.Platform = process.platform): { readonly command: string; readonly prefix: readonly string[] } => {
	if (platform === "darwin") return { command: "open", prefix: [] }
	if (platform === "win32") return { command: "rundll32", prefix: ["url.dll,FileProtocolHandler"] }
	return { command: "xdg-open", prefix: [] }
}

const refuseUrl = (command: string, url: string) =>
	Effect.fail(new CommandError({ command, args: [url], detail: "Refusing to open a URL that is not a plain http(s) link", cause: null }))

export class BrowserOpener extends Context.Service<
	BrowserOpener,
	{
		readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, CommandError>
		readonly openUrl: (url: string) => Effect.Effect<void, CommandError>
	}
>()("ghui/BrowserOpener") {
	static readonly layerNoDeps = Layer.effect(
		BrowserOpener,
		Effect.gen(function* () {
			const command = yield* CommandRunner
			const opener = platformOpener()

			const openPullRequest = Effect.fn("BrowserOpener.openPullRequest")(function* (pullRequest: PullRequestItem) {
				yield* command.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository, "--web"])
			})

			const openUrl = Effect.fn("BrowserOpener.openUrl")(function* (url: string) {
				if (!isSafeUrl(url)) return yield* refuseUrl(opener.command, url)
				yield* command.run(opener.command, [...opener.prefix, url])
			})

			return BrowserOpener.of({ openPullRequest, openUrl })
		}),
	)

	static readonly layer = BrowserOpener.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
