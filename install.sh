#!/usr/bin/env bash
# Installs or updates prs from source.
#   curl -fsSL https://raw.githubusercontent.com/mct-dev/prs/main/install.sh | bash
# Env: PRS_REPO (git url), PRS_DIR (checkout, default ~/.local/share/prs),
#      BUN_INSTALL (bin goes in $BUN_INSTALL/bin, default ~/.bun/bin).
set -eu

REPO="${PRS_REPO:-https://github.com/mct-dev/prs.git}"
DIR="${PRS_DIR:-$HOME/.local/share/prs}"
BIN="${BUN_INSTALL:-$HOME/.bun}/bin"

for cmd in git bun node; do
	if ! command -v "$cmd" >/dev/null 2>&1; then
		echo "prs install: '$cmd' not found. Install it first (see https://github.com/mct-dev/prs#install)." >&2
		exit 1
	fi
done

if [ -d "$DIR/.git" ]; then
	echo "Updating $DIR"
	git -C "$DIR" pull --ff-only
else
	echo "Cloning $REPO into $DIR"
	mkdir -p "$(dirname "$DIR")"
	git clone "$REPO" "$DIR"
fi

(cd "$DIR" && bun install)

mkdir -p "$BIN"
ln -sf "$DIR/bin/prs.js" "$BIN/prs"
echo "Installed prs -> $BIN/prs"

case ":$PATH:" in
*":$BIN:"*) ;;
*) echo "Add $BIN to your PATH to run prs." ;;
esac
