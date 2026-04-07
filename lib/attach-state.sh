#!/usr/bin/env bash

attach_state_root() {
  printf '%s\n' "${ATTACH_STATE_ROOT:-$HOME/.local/state/opencode-notify-attach}"
}

attach_state_instances_dir() {
  printf '%s/instances\n' "$(attach_state_root)"
}

attach_state_init() {
  mkdir -p "$(attach_state_instances_dir)"
}

attach_state_json_escape() {
  local value="$1"

  value=${value//\\/\\\\}
  value=${value//"/\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}

  printf '%s' "$value"
}

attach_state_register() {
  local cwd="$1"
  local server_url="$2"
  local dir host nonce pid_start_ticks record_path started_at temp_path

  attach_state_init
  dir="$(attach_state_instances_dir)"
  host="${HOSTNAME:-$(hostname 2>/dev/null || printf 'unknown')}"
  host=${host//[^a-zA-Z0-9._-]/-}
  nonce="${RANDOM}${RANDOM}"
  started_at="$(date +%s)"
  pid_start_ticks="$(attach_state_pid_start_ticks "$$")"
  record_path="$dir/$host-$$-$nonce.json"
  temp_path="$(mktemp "$dir/$host-$$-$nonce.json.tmp.XXXXXX")"

  printf '{"pid":%s,"pidStartTicks":%s,"startedAt":%s,"cwd":"%s","serverUrl":"%s","clientType":"attach"}\n' \
    "$$" \
    "$pid_start_ticks" \
    "$started_at" \
    "$(attach_state_json_escape "$cwd")" \
    "$(attach_state_json_escape "$server_url")" \
    > "$temp_path"

  mv "$temp_path" "$record_path"

  printf '%s\n' "$record_path"
}

attach_state_unregister() {
  local record_path="$1"

  rm -f "$record_path"
}

attach_state_record_pid() {
  local record="$1"
  local pid_field

  pid_field="$(printf '%s\n' "$record" | grep -oE '"pid":[0-9]+' || true)"
  if [[ -z "$pid_field" ]]; then
    return 1
  fi

  printf '%s\n' "${pid_field#*:}"
  return 0

}

attach_state_record_pid_start_ticks() {
  local record="$1"
  local ticks_field

  ticks_field="$(printf '%s\n' "$record" | grep -oE '"pidStartTicks":[0-9]+' || true)"
  if [[ -z "$ticks_field" ]]; then
    return 1
  fi

  printf '%s\n' "${ticks_field#*:}"
  return 0
}

attach_state_record_is_attach() {
  local record="$1"

  [[ "$record" == *'"clientType":"attach"'* ]]
}

attach_state_pid_start_ticks() {
  local pid="$1"
  local stat_path stat_contents stat_after_comm stat_fields

  stat_path="/proc/$pid/stat"
  if [[ ! -r "$stat_path" ]]; then
    return 1
  fi

  stat_contents="$(<"$stat_path")" || return 1
  stat_after_comm="${stat_contents##*) }"
  read -r -a stat_fields <<< "$stat_after_comm"

  if [[ ${#stat_fields[@]} -lt 20 ]]; then
    return 1
  fi

  printf '%s\n' "${stat_fields[19]}"
}

attach_state_pid_is_live() {
  local pid="$1"
  local expected_start_ticks="$2"
  local actual_start_ticks

  if ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi

  if ! actual_start_ticks="$(attach_state_pid_start_ticks "$pid")"; then
    return 1
  fi

  [[ "$actual_start_ticks" == "$expected_start_ticks" ]]
}

attach_state_prune_stale() {
  local dir pid pid_start_ticks record removed
  local files=()

  dir="$(attach_state_instances_dir)"
  if [[ ! -d "$dir" ]]; then
    printf '0\n'
    return
  fi

  removed=0

  shopt -s nullglob
  files=("$dir"/*.json)
  shopt -u nullglob

  for record_path in "${files[@]}"; do
    if [[ ! -r "$record_path" ]] || ! record="$(<"$record_path")"; then
      rm -f "$record_path"
      removed=$((removed + 1))
      continue
    fi

    if ! attach_state_record_is_attach "$record"; then
      rm -f "$record_path"
      removed=$((removed + 1))
      continue
    fi

    if ! pid="$(attach_state_record_pid "$record")"; then
      rm -f "$record_path"
      removed=$((removed + 1))
      continue
    fi

    if ! pid_start_ticks="$(attach_state_record_pid_start_ticks "$record")"; then
      rm -f "$record_path"
      removed=$((removed + 1))
      continue
    fi

    if ! attach_state_pid_is_live "$pid" "$pid_start_ticks"; then
      rm -f "$record_path"
      removed=$((removed + 1))
    fi
  done

  printf '%s\n' "$removed"
}

attach_state_active_count() {
  local dir
  local files=()

  dir="$(attach_state_instances_dir)"
  if [[ ! -d "$dir" ]]; then
    printf '0\n'
    return
  fi

  attach_state_prune_stale >/dev/null

  shopt -s nullglob
  files=("$dir"/*.json)
  shopt -u nullglob

  printf '%s\n' "${#files[@]}"
}

attach_state_has_active() {
  [[ "$(attach_state_active_count)" -gt 0 ]]
}
