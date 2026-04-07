#!/usr/bin/env bash

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="${3:-expected '$expected' but got '$actual'}"

  if [[ "$expected" != "$actual" ]]; then
    fail "$message"
  fi
}

assert_file_exists() {
  local path="$1"
  local message="${2:-expected file to exist: $path}"

  if [[ ! -f "$path" ]]; then
    fail "$message"
  fi
}

assert_not_exists() {
  local path="$1"
  local message="${2:-expected path to not exist: $path}"

  if [[ -e "$path" ]]; then
    fail "$message"
  fi
}

assert_contains() {
  local needle="$1"
  local path="$2"
  local message="${3:-expected '$path' to contain '$needle'}"

  if ! grep -Fq -- "$needle" "$path"; then
    fail "$message"
  fi
}

pass() {
  printf 'PASS: %s\n' "$1"
}
