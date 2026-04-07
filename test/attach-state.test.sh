#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/test-lib.sh"
source "$(dirname "$0")/../lib/attach-state.sh"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

export ATTACH_STATE_ROOT="$tmp_dir/state"

shell_stat="$(<"/proc/$$/stat")"
shell_stat_after_comm="${shell_stat##*) }"
read -r -a shell_stat_fields <<< "$shell_stat_after_comm"
shell_start_ticks="${shell_stat_fields[19]}"

register_trace="$tmp_dir/register-trace"
register_probe_path="$tmp_dir/register-probe-path"
(
  mv() {
    printf '%s\n' "$1|$2" > "$register_trace"
    command mv "$1" "$2"
  }

  attach_state_register "$tmp_dir/project" "http://localhost:56666" > "$register_probe_path"
)

assert_file_exists "$register_trace" "expected attach_state_register to rename a temp file into place"
assert_contains '/instances/' "$register_trace"
assert_contains '.json.tmp.' "$register_trace"
assert_contains '.json' "$register_trace"

attach_state_unregister "$(<"$register_probe_path")"

record_path="$(attach_state_register "$tmp_dir/project" "http://localhost:56666")"
instances_dir="$(attach_state_instances_dir)"
stale_path="$instances_dir/stale.json"
corrupt_path="$instances_dir/corrupt.json"
reused_pid_path="$instances_dir/reused-pid.json"
unreadable_path="$instances_dir/unreadable.json"
vanish_path="$instances_dir/vanish.json"

assert_file_exists "$record_path"
assert_contains '"clientType":"attach"' "$record_path"
assert_contains '"serverUrl":"http://localhost:56666"' "$record_path"

printf '{"pid":999999,"clientType":"attach"}\n' > "$stale_path"
printf 'not-json\n' > "$corrupt_path"
printf '{"pid":%s,"pidStartTicks":%s,"clientType":"attach"}\n' "$$" "$((shell_start_ticks + 1))" > "$reused_pid_path"
printf '{"pid":999999,"clientType":"attach"}\n' > "$unreadable_path"
chmod 000 "$unreadable_path"
printf '{"pid":999999,"clientType":"attach"}\n' > "$vanish_path"

removed_count="$({
  trap 'if [[ $BASH_COMMAND == "record=\$(<\"$record_path\")" && -f "$vanish_path" ]]; then rm -f "$vanish_path"; trap - DEBUG; fi' DEBUG
  attach_state_prune_stale
})"

assert_eq "5" "$removed_count"
assert_not_exists "$vanish_path"
assert_not_exists "$reused_pid_path"
assert_not_exists "$unreadable_path"

assert_eq "1" "$(attach_state_active_count)"
assert_not_exists "$stale_path"
assert_not_exists "$corrupt_path"

attach_state_unregister "$record_path"

assert_not_exists "$record_path"
assert_eq "0" "$(attach_state_active_count)"

pass "attach-state"
