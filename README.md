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

## Future Integration Notes

- Keep this repo isolated from live shell aliases and OpenCode config during the prototype.
- A future `C()` wrapper can call `bin/attach-open`.
- A future notifier command hook can call `bin/notify-if-attach` for attach-specific `permission` or `question` events.
