#!/bin/sh
# Fake `claude` / `codex` binary for review runner tests.
# FAKE_AGENT_MODE: ok (default) | bad | error | sleep
# FAKE_AGENT_RECORD: file that receives cwd then argv, NUL-separated.
# FAKE_AGENT_COPY_CONTEXT: directory prefix; the cwd's .prs-context is copied to "<prefix>-<pid>".
if [ -n "$FAKE_AGENT_RECORD" ]; then
	printf '%s\0' "$(pwd -P)" "$@" > "$FAKE_AGENT_RECORD"
fi
if [ -n "$FAKE_AGENT_COPY_CONTEXT" ] && [ -d .prs-context ]; then
	cp -R .prs-context "$FAKE_AGENT_COPY_CONTEXT-$$"
fi

brief='{"risk":"medium","summary":"Adds a greeting.","before_after":null,"focus_areas":[{"file":"hello.txt","lines":"1","why":"New text.","severity":"low"}],"safe_to_skip":[],"questions":[],"tests":null,"confidence":"high"}'
mode="${FAKE_AGENT_MODE:-ok}"

if [ "$mode" = "sleep" ]; then
	sleep 60 &
	[ -n "$FAKE_AGENT_CHILD_PID" ] && echo $! > "$FAKE_AGENT_CHILD_PID"
	wait
	exit 0
fi

case "$mode" in
	bad) brief='{"risk":"catastrophic","summary":"x"}' ;;
esac

if [ "$1" = "exec" ]; then
	out=""
	while [ $# -gt 0 ]; do
		if [ "$1" = "-o" ]; then out="$2"; shift; fi
		shift
	done
	[ "$mode" = "error" ] && { echo "codex failed" >&2; exit 1; }
	printf '%s' "$brief" > "$out"
	exit 0
fi

echo "fake agent starting" >&2
if [ "$mode" = "error" ]; then
	echo '{"type":"result","subtype":"error_max_budget_usd","is_error":true,"total_cost_usd":1.5}'
	exit 1
fi
printf '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.12,"structured_output":%s}\n' "$brief"
