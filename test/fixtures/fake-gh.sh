#!/bin/sh
# Fake `gh` for diff-only review tests: `gh pr diff <n> -R owner/repo`.
if [ "$1" = "pr" ] && [ "$2" = "diff" ]; then
	cat <<'DIFF'
diff --git a/hello.txt b/hello.txt
new file mode 100644
--- /dev/null
+++ b/hello.txt
@@ -0,0 +1 @@
+hello
DIFF
	exit 0
fi
echo "unexpected gh call: $*" >&2
exit 1
