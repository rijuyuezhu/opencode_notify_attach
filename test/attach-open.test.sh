#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/test-lib.sh"
source "$(dirname "$0")/../lib/attach-state.sh"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

export ATTACH_STATE_ROOT="$tmp_dir/state"
attach_state_lib="$(cd -P "$(dirname "$0")/.." && pwd)/lib/attach-state.sh"
export ATTACH_STATE_LIB="$attach_state_lib"

fake_opencode="$tmp_dir/opencode"
cat <<'EOF' > "$fake_opencode"
#!/usr/bin/env bash
set -euo pipefail

source "$ATTACH_STATE_LIB"

attach_state_active_count > "$ATTACH_STATE_ROOT/seen-count"
printf '%s' "$*" > "$ATTACH_STATE_ROOT/seen-args"

exit "${FAKE_OPENCODE_EXIT_CODE:-0}"
EOF
chmod +x "$fake_opencode"

export OPENCODE_BIN="$fake_opencode"

"$(dirname "$0")/../bin/attach-open" http://localhost:56666 "$tmp_dir/project" --continue --print-logs

assert_eq "1" "$(<"$ATTACH_STATE_ROOT/seen-count")"
assert_eq "attach http://localhost:56666 --dir $tmp_dir/project --continue --print-logs" "$(<"$ATTACH_STATE_ROOT/seen-args")"
assert_eq "0" "$(attach_state_active_count)"

set +e
FAKE_OPENCODE_EXIT_CODE=23 "$(dirname "$0")/../bin/attach-open" http://localhost:56666 "$tmp_dir/project"
status=$?
set -e

assert_eq "23" "$status"
assert_eq "0" "$(attach_state_active_count)"

instances_dir="$(attach_state_instances_dir)"
mkdir -p "$instances_dir"
printf '{"pid":999999,"clientType":"attach"}\n' > "$instances_dir/stale.json"

prune_output="$("$(dirname "$0")/../bin/prune-attach-state")"

assert_eq "1" "$prune_output"
assert_not_exists "$instances_dir/stale.json"

pass "attach-open"
