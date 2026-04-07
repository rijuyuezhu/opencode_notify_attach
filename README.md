# opencode_notify_attach

Prototype scripts for an `opencode attach`-specific notification workaround.

## Scope

- Track whether at least one attach client is active.
- Keep per-instance JSON state under `~/.local/state/opencode-notify-attach/instances/` by default.
- Gate attach-only desktop notifications behind that state.
- Keep the user's current web notification flow unchanged.

## Scripts

### `bin/attach-open`

Registers an active attach client for the lifetime of the command, then runs `opencode attach`.

Example:

```bash
bin/attach-open http://localhost:56666 ~/project
```

### `bin/notify-if-attach`

Sends a desktop notification only when at least one tracked attach client is active.

Example:

```bash
bin/notify-if-attach permission "Session needs permission"
```

### `bin/prune-attach-state`

Removes stale or invalid attach-state records from the state directory.

Example:

```bash
bin/prune-attach-state
```

## Test Commands

- `bash test/attach-state.test.sh`
- `bash test/notify-if-attach.test.sh`
- `bash test/attach-open.test.sh`

## Real Config

The real plugin can be loaded globally by adding this entry to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "file:///home/rijuyuezhu/Code/opencode_notify_attach/.opencode/plugins/attach-notify.ts"
  ]
}
```

That plugin reads its own defaults from `.opencode/attach-notify.json` inside this repo, and with the current config it will keep running for non-CLI clients because `enableOnDesktop` is set to `true`.

## Shell Setup

The practical way to use this for `attach` is to route your shell helper through `bin/attach-open`.

Example `~/.user_configrc` setup:

```bash
if command -v opencode &>/dev/null; then
    function C() {
        local attach_open="$HOME/Code/opencode_notify_attach/bin/attach-open"
        if [[ -x "$attach_open" ]]; then
            "$attach_open" http://localhost:56666 "$PWD" "$@"
        else
            opencode attach http://localhost:56666 --dir "$PWD" "$@"
        fi
    }
fi
```

Reload your shell after changing that file:

```bash
source ~/.user_configrc
```

## Local Plugin

This repo now includes a project-local OpenCode plugin at `.opencode/plugins/attach-notify.ts`.

The plugin maps OpenCode events to `bin/notify-if-attach` calls:

- `permission.asked` and `permission.ask` -> `permission`
- `session.idle` -> `complete`
- `session.error` -> `error`
- `tool.execute.before` for `question` -> `question`
- `tool.execute.before` for `plan_exit` -> `plan_exit`

Plugin defaults live in `.opencode/attach-notify.json`. The important switch is:

- `enableOnDesktop: true` keeps the plugin active when OpenCode is running in non-CLI clients such as `serve`/web flows, matching the same idea used by `@mohak34/opencode-notifier`

## OpenCode Config

Use the example config in `examples/opencode.attach-notify.json` when starting a dedicated local server:

```bash
OPENCODE_CONFIG="$PWD/examples/opencode.attach-notify.json" opencode serve
```

You can confirm that OpenCode resolves the local plugin with:

```bash
OPENCODE_CONFIG="$PWD/examples/opencode.attach-notify.json" opencode debug config
```

## Usage

Daily use is through `C()`:

```bash
C
```

Because `C()` now calls `bin/attach-open`, it creates and clears attach presence automatically around the real `opencode attach` process.

Extra attach flags still pass through:

```bash
C --continue
C --session <session-id>
C --print-logs
```

For direct manual testing without the shell helper:

```bash
bin/attach-open http://localhost:56666 "$PWD"
```

To verify OpenCode is resolving the globally configured plugin outside this repo:

```bash
cd /tmp
opencode debug config
```

You should see this plugin spec in the resolved config:

```text
file:///home/rijuyuezhu/Code/opencode_notify_attach/.opencode/plugins/attach-notify.ts
```
