# Typefully CLI — Specification

> **This document is the authoritative contract for the Typefully CLI.**
> All commands, options, arguments, output shapes, and behaviors described here must be satisfied by any conforming implementation.

Last updated: 2026-02-18

---

## Table of Contents

1. [Invocation](#invocation)
2. [Global Flags](#global-flags)
3. [Output Modes](#output-modes)
4. [Configuration & Authentication](#configuration--authentication)
5. [Exit Codes](#exit-codes)
6. [Commands](#commands)
   - [setup](#setup)
   - [me](#me)
   - [social-sets list](#social-sets-list)
   - [social-sets get](#social-sets-get)
   - [drafts list](#drafts-list)
   - [drafts get](#drafts-get)
   - [drafts create](#drafts-create)
   - [drafts update](#drafts-update)
   - [drafts delete](#drafts-delete)
   - [drafts schedule](#drafts-schedule)
   - [drafts publish](#drafts-publish)
   - [create-draft](#create-draft-alias)
   - [update-draft](#update-draft-alias)
   - [tags list](#tags-list)
   - [tags create](#tags-create)
   - [media upload](#media-upload)
   - [media status](#media-status)
   - [config show](#config-show)
   - [config set-default](#config-set-default)
7. [Thread Syntax](#thread-syntax)
8. [Error Shape](#error-shape)
9. [Environment Variables](#environment-variables)

---

## Invocation

```
typefully [global-flags] <command> [subcommand] [arguments] [options]
```

The binary name is `typefully`. All commands and subcommands are lowercase, hyphen-separated.

---

## Global Flags

These flags apply to every command and must be parsed before the subcommand action runs.

| Flag | Short | Description |
|------|-------|-------------|
| `--version` | `-v` | Print version and exit. Banner is suppressed. |
| `--json` | `-j` | Force JSON output mode. Suppresses banner and spinners. stdout receives only the JSON payload. |

---

## Output Modes

### Human-readable (default)

When stdout is a TTY and `--json` is not set, the CLI prints colored, formatted output to stdout and uses `ora` spinners for in-progress state (written to stderr).

### JSON mode

Activated by `--json` / `-j` **or** when `stdout` is not a TTY (i.e., piped or redirected).

- **stdout**: a single pretty-printed JSON object (`JSON.stringify(data, null, 2)`)
- **stderr**: nothing (spinners and banners are suppressed)
- The banner (ASCII art / intro text) is never shown in JSON mode

### Banner

The banner is shown once per invocation before the first command action, **unless**:
- `--version` / `-v` is passed
- `--json` / `-j` is passed
- stdout is not a TTY

---

## Configuration & Authentication

### Config file format

```json
{
  "apiKey": "typ_xxxx",
  "defaultSocialSetId": 12345
}
```

Files are written with `0600` permissions. Invalid or missing files are silently ignored.

### Priority order (highest wins)

1. `TYPEFULLY_API_KEY` environment variable
2. `./.typefully/config.json` (project-local, relative to cwd)
3. `~/.config/typefully/config.json` (user-global)

### Missing API key behavior

- **TTY stderr**: interactive clack prompt guides the user to obtain a key, choose a storage location, and saves it. Returns immediately once saved.
- **Non-TTY stderr**: prints JSON error to stderr and exits with code 1.

```json
{ "error": "API key not found", "hint": "Run: typefully setup", "api_key_url": "https://typefully.com/?settings=api" }
```

### Missing social_set_id behavior

- Checks for a configured default (local then global config).
- If no default: prints JSON error to stderr, exits 1.

```json
{ "error": "social_set_id is required", "hint": "Run: typefully config set-default to set a default, or provide it as an argument" }
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (authentication failure, missing required arg, API error, file not found, etc.) |

---

## Commands

---

### `setup`

Interactive or non-interactive first-time setup. Saves the API key and optionally a default social set.

```
typefully setup [options]
```

**Options**

| Flag | Description |
|------|-------------|
| `--key <api_key>` | API key (non-interactive mode when provided) |
| `--location <global\|local>` | Where to store the config file |
| `--scope <global\|local>` | Alias for `--location` |
| `--default-social-set <id>` | Set default social set ID non-interactively |
| `--no-default` | Skip default social set selection entirely |

**Behavior**

- If `--key` is omitted: interactive clack flow (prompt for key, location, gitignore, default social set).
- If `--key` is provided: non-interactive. `--location` defaults to `global` if omitted.
- If only one social set exists and `--no-default` is not set: auto-selects it as the default.
- For local configs: offers to add `.typefully/` to `.gitignore`.

**JSON output shape**

```json
{
  "success": true,
  "message": "Setup complete",
  "config_path": "/Users/you/.config/typefully/config.json",
  "scope": "global",
  "default_social_set_id": 12345
}
```

---

### `me`

Returns the authenticated user's profile.

```
typefully me
```

**No options.**

**JSON output shape** — mirrors the Typefully API `/me` response (fields vary by plan):

```json
{
  "id": 1,
  "name": "Ahmad Awais",
  "email": "hi@example.com",
  "username": "ahmadawais",
  "plan": "pro",
  "timezone": "America/New_York",
  "locale": "en",
  "avatar_url": "https://..."
}
```

---

### `social-sets list`

Lists all social sets accessible to the authenticated user.

```
typefully social-sets list
```

**No options.**

**JSON output shape**

```json
{
  "results": [
    {
      "id": 123,
      "name": "Ahmad Awais",
      "username": "ahmadawais",
      "team": null,
      "platforms": {
        "x": { "connected": true, "username": "ahmadawais" },
        "linkedin": { "connected": false }
      }
    }
  ],
  "total": 1
}
```

---

### `social-sets get`

Returns details for a specific social set.

```
typefully social-sets get [social_set_id]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[social_set_id]` | Social set ID. Uses configured default if omitted. |

**JSON output shape** — single social set object (same shape as one item from `social-sets list`).

---

### `drafts list`

Lists drafts for a social set.

```
typefully drafts list [social_set_id] [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[social_set_id]` | Uses configured default if omitted. |

**Options**

| Flag | Description |
|------|-------------|
| `--status <status>` | Filter: `draft`, `scheduled`, `published`, `error` |
| `--tag <tag>` | Filter by tag slug |
| `--sort <order>` | Sort field (e.g., `created_at`, `-created_at`, `scheduled_date`) |
| `--limit <n>` | Max results. Default: `10` |

**JSON output shape**

```json
{
  "results": [ /* draft objects */ ],
  "total": 42
}
```

---

### `drafts get`

Returns a specific draft.

```
typefully drafts get [first_arg] [second_arg] [options]
```

**Arguments**

Argument resolution (same pattern used by `delete`, `schedule`, `publish`):

| Args provided | Interpretation |
|---------------|----------------|
| `<social_set_id> <draft_id>` | Explicit — no ambiguity |
| `<draft_id>` (single arg) + default configured + `--use-default` | Uses default social set |
| `<draft_id>` (single arg) + default configured, no `--use-default` | **Error**: ambiguous — add `--use-default` |
| `<draft_id>` (single arg) + no default configured | **Error**: provide both IDs |
| No args | **Error**: `draft_id is required` |

**Options**

| Flag | Description |
|------|-------------|
| `--use-default` | Confirm intent to use the configured default social set when only `draft_id` is provided |

**JSON output shape** — single draft object.

---

### `drafts create`

Creates a new draft.

```
typefully drafts create [social_set_id] [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[social_set_id]` | Uses configured default if omitted. |

**Options**

| Flag | Short | Description |
|------|-------|-------------|
| `--text <text>` | | Post content. Use `---` on its own line to create thread posts. |
| `--file <path>` | `-f` | Read content from file (overrides `--text`). |
| `--platform <platforms>` | | Comma-separated platform names. Auto-selects first connected if omitted. |
| `--all` | | Post to all connected platforms. Mutually exclusive with `--platform`. |
| `--media <media_ids>` | | Comma-separated media IDs to attach to the first post. |
| `--title <title>` | | Internal draft title (never published). |
| `--schedule <time>` | | `"now"`, `"next-free-slot"`, or ISO 8601 datetime. |
| `--tags <tags>` | | Comma-separated tag slugs. |
| `--reply-to <url>` | | URL of X post to reply to (X platform only). |
| `--community <id>` | | X community ID to post into (X platform only). |
| `--share` | | Generate a public share URL for the draft. |
| `--scratchpad <text>` | | Internal notes attached to the draft. Never published. |
| `--notes <text>` | | Alias for `--scratchpad`. |

**Constraints**

- `--text` or `--file` is required.
- `--all` and `--platform` are mutually exclusive.

**JSON output shape** — single draft object.

---

### `drafts update`

Updates an existing draft. At least one change option is required.

```
typefully drafts update [first_arg] [second_arg] [options]
```

**Arguments** — same resolution rules as `drafts get`.

**Options**

| Flag | Short | Description |
|------|-------|-------------|
| `--text <text>` | | Replace post content. |
| `--file <path>` | `-f` | Read new content from file. |
| `--platform <platforms>` | | Override which platforms are enabled. Preserves existing if omitted. |
| `--media <media_ids>` | | Comma-separated media IDs. |
| `--append` | `-a` | Append a new post to the existing thread instead of replacing. |
| `--title <title>` | | Update the internal title. |
| `--schedule <time>` | | Reschedule: `"now"`, `"next-free-slot"`, or ISO 8601 datetime. |
| `--tags <tags>` | | Replace tag slugs. |
| `--share` | | Generate a public share URL. |
| `--scratchpad <text>` | | Update internal notes. |
| `--notes <text>` | | Alias for `--scratchpad`. |
| `--use-default` | | Confirm use of default social set for single-arg form. |

**Constraints**

- At least one of `--text`, `--file`, `--title`, `--schedule`, `--share`, `--scratchpad`/`--notes`, or `--tags` is required.

**JSON output shape** — single draft object.

---

### `drafts delete`

Deletes a draft permanently.

```
typefully drafts delete [first_arg] [second_arg] [options]
```

**Arguments** — same resolution rules as `drafts get`.

**Options**

| Flag | Description |
|------|-------------|
| `--use-default` | Confirm use of default social set for single-arg form. |

**JSON output shape**

```json
{ "success": true, "message": "Draft deleted" }
```

---

### `drafts schedule`

Schedules an existing draft.

```
typefully drafts schedule [first_arg] [second_arg] [options]
```

**Arguments** — same resolution rules as `drafts get`.

**Options**

| Flag | Description |
|------|-------------|
| `--time <time>` | **Required.** `"next-free-slot"` or ISO 8601 datetime. |
| `--use-default` | Confirm use of default social set for single-arg form. |

**JSON output shape** — single draft object.

---

### `drafts publish`

Publishes a draft immediately.

```
typefully drafts publish [first_arg] [second_arg] [options]
```

**Arguments** — same resolution rules as `drafts get`.

**Options**

| Flag | Description |
|------|-------------|
| `--use-default` | Confirm use of default social set for single-arg form. |

**JSON output shape** — single draft object.

---

### `create-draft` (alias)

Top-level alias for `drafts create` with positional text. Designed for agents and scripts where positional arguments are more natural.

```
typefully create-draft [text] [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[text]` | Draft content. Overridden by `--text` or `--file` if provided. |

**Options**

| Flag | Short | Description |
|------|-------|-------------|
| `--social-set-id <id>` | | Social set ID. Uses configured default if omitted. |
| `--text <text>` | | Explicit content (overrides positional `[text]`). |
| `--file <path>` | `-f` | Read content from file (overrides positional `[text]` and `--text`). |
| `--platform <platforms>` | | Comma-separated platform names. |
| `--all` | | Post to all connected platforms. |
| `--media <media_ids>` | | Comma-separated media IDs. |
| `--title <title>` | | Internal draft title. |
| `--schedule <time>` | | `"now"`, `"next-free-slot"`, or ISO 8601 datetime. |
| `--tags <tags>` | | Comma-separated tag slugs. |
| `--reply-to <url>` | | URL of X post to reply to. |
| `--community <id>` | | X community ID. |
| `--share` | | Generate a public share URL. |
| `--scratchpad <text>` | | Internal notes. |
| `--notes <text>` | | Alias for `--scratchpad`. |

**Text resolution priority**: `--file` > `--text` > positional `[text]`. At least one must be provided.

**JSON output shape** — single draft object (same as `drafts create`).

---

### `update-draft` (alias)

Top-level alias for `drafts update` with a positional draft ID. Designed for agents and scripts.

```
typefully update-draft <draft_id> [text] [options]
```

**Arguments**

| Argument | Required | Description |
|----------|----------|-------------|
| `<draft_id>` | Yes | ID of the draft to update. |
| `[text]` | No | New content. Overridden by `--text` or `--file` if provided. |

**Options**

| Flag | Short | Description |
|------|-------|-------------|
| `--social-set-id <id>` | | Social set ID. Uses configured default if omitted. |
| `--text <text>` | | New content (overrides positional `[text]`). |
| `--file <path>` | `-f` | Read content from file. |
| `--platform <platforms>` | | Override enabled platforms. |
| `--media <media_ids>` | | Comma-separated media IDs. |
| `--append` | `-a` | Append new post to existing thread. |
| `--title <title>` | | Update internal title. |
| `--schedule <time>` | | Reschedule. |
| `--tags <tags>` | | Replace tag slugs. |
| `--share` | | Generate a public share URL. |
| `--scratchpad <text>` | | Update internal notes. |
| `--notes <text>` | | Alias for `--scratchpad`. |

**Text resolution priority**: `--file` > `--text` > positional `[text]`.

**Constraints** — same as `drafts update`: at least one change option required.

**JSON output shape** — single draft object (same as `drafts update`).

---

### `tags list`

Lists all tags for a social set.

```
typefully tags list [social_set_id]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[social_set_id]` | Uses configured default if omitted. |

**JSON output shape**

```json
{
  "results": [
    { "id": 1, "name": "Product", "slug": "product" }
  ]
}
```

---

### `tags create`

Creates a new tag.

```
typefully tags create [social_set_id] --name <name>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[social_set_id]` | Uses configured default if omitted. |

**Options**

| Flag | Description |
|------|-------------|
| `--name <name>` | **Required.** Tag display name. |

**JSON output shape**

```json
{ "id": 1, "name": "Product", "slug": "product" }
```

---

### `media upload`

Uploads a media file and waits for processing (unless `--no-wait`).

```
typefully media upload <file_path> [social_set_id] [options]
```

**Arguments**

| Argument | Required | Description |
|----------|----------|-------------|
| `<file_path>` | Yes | Path to the local file to upload. |
| `[social_set_id]` | No | Uses configured default if omitted. |

**Options**

| Flag | Description |
|------|-------------|
| `--social-set-id <id>` | Social set ID via flag (overrides positional). |
| `--no-wait` | Return immediately after S3 upload without waiting for processing. |
| `--timeout <seconds>` | Max seconds to wait for processing. Default: `60`. |

**Behavior**

1. Requests a presigned S3 URL from the API.
2. Uploads the file to S3 via HTTP PUT.
3. Polls `media status` until `status === "ready"` or `status === "error"/"failed"`, or timeout.
4. With `--no-wait`: returns after step 2 with `status: "processing"`.

Poll interval can be overridden with `TYPEFULLY_MEDIA_POLL_INTERVAL_MS` env var (default: 2000ms).

**JSON output shape (ready)**

```json
{ "media_id": "abc-123", "status": "ready", "message": "Media uploaded and ready" }
```

**JSON output shape (no-wait)**

```json
{ "media_id": "abc-123", "message": "Upload complete. Use media status to check processing." }
```

**JSON output shape (timeout)**

```json
{
  "media_id": "abc-123",
  "status": "processing",
  "message": "Upload complete but still processing. Use media status to check.",
  "hint": "Increase timeout with --timeout <seconds>"
}
```

---

### `media status`

Checks the processing status of an uploaded media file.

```
typefully media status <media_id> [social_set_id] [options]
```

**Arguments**

| Argument | Required | Description |
|----------|----------|-------------|
| `<media_id>` | Yes | Media ID returned by `media upload`. |
| `[social_set_id]` | No | Uses configured default if omitted. |

**Options**

| Flag | Description |
|------|-------------|
| `--social-set-id <id>` | Social set ID via flag (overrides positional). |

**JSON output shape** — media status object from the API (includes `status` field: `"ready"`, `"processing"`, `"error"`, `"failed"`).

---

### `config show`

Shows the current configuration state.

```
typefully config show
```

**No options.**

**JSON output shape (configured)**

```json
{
  "configured": true,
  "active_source": "/Users/you/.config/typefully/config.json",
  "api_key_preview": "typ_xxxx...",
  "default_social_set": { "id": 123, "source": "/Users/you/.config/typefully/config.json" },
  "config_files": {
    "local": { "path": ".typefully/config.json", "has_key": false, "has_default_social_set": false },
    "global": { "path": "/Users/you/.config/typefully/config.json", "has_key": true, "has_default_social_set": true }
  }
}
```

**JSON output shape (not configured)**

```json
{ "configured": false, "hint": "Run: typefully setup", "api_key_url": "https://typefully.com/?settings=api" }
```

---

### `config set-default`

Sets the default social set ID.

```
typefully config set-default [social_set_id] [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[social_set_id]` | Social set ID to set as default. Prompts interactively if omitted. |

**Options**

| Flag | Description |
|------|-------------|
| `--location <global\|local>` | Where to save: `global` (~/.config/typefully/) or `local` (./.typefully/). Interactive if omitted. |
| `--scope <global\|local>` | Alias for `--location`. |

**Behavior**

- Verifies the social set exists via API before saving.
- If `social_set_id` is omitted: fetches social sets and shows a numbered list to choose from.
- If only one social set exists: auto-selects it.

**JSON output shape**

```json
{
  "success": true,
  "message": "Default social set configured",
  "default_social_set_id": 123,
  "config_path": "/Users/you/.config/typefully/config.json",
  "scope": "global"
}
```

---

## Thread Syntax

Split a single draft into a thread by using `---` on its own line as a separator:

```
First post in the thread.

---

Second post. Can include line breaks
within the same post.

---

Third post.
```

The separator is matched by: `/\r?\n[ \t]*---[ \t]*\r?\n/`

---

## Error Shape

All errors are written to **stdout** as JSON (so they are parseable in JSON mode):

```json
{ "error": "<message>", "hint": "<optional hint>", ...extraFields }
```

Process exits with code `1`.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TYPEFULLY_API_KEY` | API key. Highest priority, overrides all config files. |
| `TYPEFULLY_API_BASE` | Override API base URL. Default: `https://api.typefully.com/v2`. |
| `TYPEFULLY_MEDIA_POLL_INTERVAL_MS` | Polling interval for `media upload`. Default: `2000`. |
