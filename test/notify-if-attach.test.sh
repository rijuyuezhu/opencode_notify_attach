#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/test-lib.sh"
source "$(dirname "$0")/../lib/attach-state.sh"

script_path="$(cd "$(dirname "$0")/.." && pwd)/bin/notify-if-attach"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

export ATTACH_STATE_ROOT="$tmp_dir/state"

fake_bin="$tmp_dir/fake-bin"
mkdir -p "$fake_bin"

cat >"$fake_bin/notify-send" <<'EOF'
#!/usr/bin/env bash
printf '%s|%s|%s|%s\n' "$1" "$2" "$4" "$5" >> "$ATTACH_STATE_ROOT/notify.log"
EOF
chmod +x "$fake_bin/notify-send"

PATH="$fake_bin:$PATH" "$(dirname "$0")/../bin/notify-if-attach" permission "Session needs permission"
assert_not_exists "$ATTACH_STATE_ROOT/notify.log"

attach_state_register "$tmp_dir/project" "http://localhost:56666" >/dev/null

PATH="$fake_bin:$PATH" "$(dirname "$0")/../bin/notify-if-attach" permission "Session Title" "Session needs permission"
assert_file_exists "$ATTACH_STATE_ROOT/notify.log"
assert_contains '--app-name|OpenCode|Session Title|Session needs permission' "$ATTACH_STATE_ROOT/notify.log"

path_bin="$tmp_dir/path-bin"
mkdir -p "$path_bin"
ln -s "$script_path" "$path_bin/notify-if-attach"

rm -f "$ATTACH_STATE_ROOT/notify.log"

PATH="$path_bin:$fake_bin:$PATH" notify-if-attach permission "Session Title" "Session needs permission"
assert_file_exists "$ATTACH_STATE_ROOT/notify.log"
assert_contains '--app-name|OpenCode|Session Title|Session needs permission' "$ATTACH_STATE_ROOT/notify.log"

utility_bin="$tmp_dir/utility-bin"
mkdir -p "$utility_bin"
ln -s "$(command -v bash)" "$utility_bin/bash"
ln -s "$(command -v grep)" "$utility_bin/grep"
ln -s "$(command -v rm)" "$utility_bin/rm"

set +e
missing_notify_output="$({ PATH="$utility_bin" "$(dirname "$0")/../bin/notify-if-attach" permission "Session needs permission"; } 2>&1)"
missing_notify_status=$?
set -e

assert_eq "1" "$missing_notify_status"
assert_eq 'notify-send is required for attach notifications' "$missing_notify_output"

pass "notify-if-attach"
