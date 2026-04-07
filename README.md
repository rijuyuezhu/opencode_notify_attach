# opencode_notify_attach

Prototype scripts for an `opencode attach`-specific notification workaround.

## Setup

Clone this repository somewhere stable first:

```bash
git clone https://github.com/rijuyuezhu/opencode_notify_attach /path/to/opencode_notify_attach
cd /path/to/opencode_notify_attach
```

Add the plugin to your global OpenCode config at `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "file:///path/to/opencode_notify_attach/.opencode/plugins/attach-notify.ts"
  ]
}
```

The plugin reads its defaults from `/path/to/opencode_notify_attach/.opencode/attach-notify.json`.

Route your shell helper through `bin/attach-open` from either `~/.bashrc` or `~/.zshrc`:

```bash
if command -v opencode &>/dev/null; then
    function C() {
        local attach_open="/path/to/opencode_notify_attach/bin/attach-open"
        if [[ -x "$attach_open" ]]; then
            "$attach_open" http://localhost:56666 "$PWD" "$@"
        else
            opencode attach http://localhost:56666 --dir "$PWD" "$@"
        fi
    }
fi
```

Reload your shell after updating the file:

```bash
source ~/.bashrc
# or
source ~/.zshrc
```

## Daily Usage

Daily use is through `C()`:

```bash
C
```

Because `C()` calls `bin/attach-open`, it creates and clears attach presence automatically around the real `opencode attach` process.

Extra attach flags still pass through:

```bash
C --continue
C --session <session-id>
C --print-logs
```

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
OPENCODE_CONFIG="/path/to/opencode_notify_attach/examples/opencode.attach-notify.json" opencode serve
```

You can confirm that OpenCode resolves the local plugin with:

```bash
OPENCODE_CONFIG="/path/to/opencode_notify_attach/examples/opencode.attach-notify.json" opencode debug config
```

For direct manual testing without the shell helper:

```bash
/path/to/opencode_notify_attach/bin/attach-open http://localhost:56666 "$PWD"
```

To verify OpenCode is resolving the globally configured plugin outside this repo:

```bash
cd /tmp
opencode debug config
```

You should see this plugin spec in the resolved config:

```text
file:///path/to/opencode_notify_attach/.opencode/plugins/attach-notify.ts
```
