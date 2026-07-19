---
name: typefully
description: >
  Create, schedule, and manage social media posts via Typefully. ALWAYS use this
  skill when asked to draft, schedule, post, or check tweets, posts, threads, or
  social media content for Twitter/X, LinkedIn, Threads, Bluesky, or Mastodon.
last-updated: 2026-07-18
allowed-tools: Bash(typefully*)
---

# Typefully Skill

Create, schedule, and publish social media content across multiple platforms using [Typefully](https://typefully.com).

## Quick Start

```bash
tfly                              # interactive - pick text, platform, schedule
tfly "Hello, world!"              # instant draft (uses default platforms)
tfly rm                           # interactive draft picker to delete
tfly rm <draft_id>                # delete specific draft
```

### Handling "API key not found" errors

**CRITICAL**: When you receive an "API key not found" error from the CLI:

**Tell the user to run the setup command** - The setup is interactive and requires user input, so you cannot run it on their behalf:
```sh
typefully setup
```


## Social Sets

The Typefully API uses the term "social set" to refer to what users commonly call an "account". A social set contains the connected social media platforms (X, LinkedIn, Threads, etc.) for a single identity.

**The CLI supports a default social set** - once configured, most commands work without specifying the social_set_id.

**You can pass the social set either way**:
- Positional: `typefully drafts list 123`
- Flag: `typefully drafts list --social-set-id 123`

When determining which social set to use:

1. **Check for a configured default first** - Run `typefully config show` to see if a default is already set:
   ```sh
   typefully config show
   ```
   If `default_social_set` is configured, the CLI uses it automatically when you omit the social_set_id.

2. **Check project context** - Look for configuration in project files like `CLAUDE.md` or `AGENTS.md`:

   ```markdown
   ## Typefully
   Default social set ID: 12345
   ```

3. **Single social set shortcut** - If the user only has one social set and no default is configured, use it automatically

4. **Multiple social sets, no default** - Ask the user which to use, then **offer to save their choice as the default**:
   ```sh
   typefully config set-default
   ```
   This command lists available social sets and saves the choice to the config file.

5. **Reuse previously resolved social set** - If determined earlier in the session, use it without asking again

## Common Actions

| User says... | Action |
|--------------|--------|
| "Draft a tweet about X" | `typefully drafts create --text "..."` (uses default social set) |
| "Post this to LinkedIn" | `typefully drafts create --platform linkedin --text "..."` |
| "Post to X and LinkedIn" (same content) | `typefully drafts create --platform x,linkedin --text "..."` |
| "X thread + LinkedIn post" (different content) | Create one draft, then `typefully drafts update` to add platform (see [Publishing to Multiple Platforms](#publishing-to-multiple-platforms)) |
| "What's scheduled?" | `typefully drafts list --status scheduled` |
| "Show my recent posts" | `typefully drafts list --status published` |
| "Schedule this for tomorrow" | `typefully drafts create ... --schedule "2025-01-21T09:00:00Z"` |
| "Post this now" | `typefully drafts create ... --schedule now` or `typefully drafts publish <draft_id> --use-default` |
| "Add notes/ideas to the draft" | `typefully drafts create ... --scratchpad "Your notes here"` |
| "Set my default platforms" | `typefully config set-platforms` |
| "Delete a draft" | `tfly rm [draft_id]` |
| "Check available tags" | `typefully tags list` |

## Workflow

Follow this workflow when creating posts:

1. **Check if a default social set is configured**:
   ```sh
   typefully config show
   ```
   If `default_social_set` shows an ID, skip to step 3.

2. **If no default, list social sets** to find available options:
   ```sh
   typefully social-sets list
   ```
   If multiple exist, ask the user which to use and offer to set it as default:
   ```sh
   typefully config set-default
   ```

3. **Create drafts** (social_set_id is optional if default is configured):
   ```sh
   typefully drafts create --text "Your post"
   ```
   Note: If `--platform` is omitted, uses `defaultPlatforms` config if set, else first connected platform. Set defaults with `typefully config set-platforms`.

   **For multi-platform posts**: See [Publishing to Multiple Platforms](#publishing-to-multiple-platforms) - always use a single draft, even when content differs per platform.

4. **Schedule or publish** as needed

## Source Evidence for X Content

Before creating X/Twitter drafts from market, audience, or competitor research,
ground the post in source material. Use links, notes, exports, or research
already present in the user's project.

If the project includes the Xquik `x-twitter-scraper` Skill or an Xquik REST or
MCP workflow, treat its outputs as source evidence before drafting. Useful
inputs include searched posts, reply inspection, user lookup, follower exports,
media lookups, monitor events, and webhook summaries.

Do not configure or publish through Xquik from this Skill. Typefully remains the
place to create, schedule, and publish drafts. When the user wants private
context attached to a draft, put concise source notes in `--scratchpad`.

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

## Working with Tags

Tags help organize drafts within Typefully. **Always check existing tags before creating new ones**:

1. **List existing tags first**:
   ```sh
   typefully tags list
   ```

2. **Use existing tags when available** - if a tag with the desired name already exists, use it directly when creating drafts:
   ```sh
   typefully drafts create --text "..." --tags existing-tag-name
   ```

3. **Only create new tags if needed** - if the tag doesn't exist, create it:
   ```sh
   typefully tags create --name "New Tag"
   ```

**Important**: Tags are scoped to each social set. A tag created for one social set won't appear in another.

## Publishing to Multiple Platforms

If a single draft needs to be created for different platforms, you need to make sure to create **a single draft** and not multiple drafts.

When the content is the same across platforms, create a single draft with multiple platforms:

```sh
# Specific platforms
typefully drafts create --platform x,linkedin,threads,bluesky --text "Big announcement!"

# All connected platforms
typefully drafts create --all --text "Posting everywhere!"
```

**IMPORTANT**: When content should be tailored (e.g., X thread with a LinkedIn post version), **still use a single draft** - create with one platform first, then update to add the other:

```sh
# 1. Create draft with the primary platform first
typefully drafts create --platform linkedin --text "Excited to share our new feature..."
# Returns: { "id": "draft-123", ... }

# 2. Update the same draft to add another platform with different content
typefully drafts update draft-123 --platform x --text "Thread time!

---

Here's what we shipped and why it matters..." --use-default
```

So make sure to NEVER create multiple drafts unless the user explicitly wants separate drafts for each platform.

## Commands Reference

### User & Social Sets

| Command | Description |
|---------|-------------|
| `typefully me` | Get authenticated user info |
| `typefully social-sets list` | List all social sets you can access |
| `typefully social-sets get <id>` | Get social set details including connected platforms |

### Drafts

All drafts commands support an optional `[social_set_id]` positional argument or `--social-set-id <id>` flag - if omitted, the configured default is used.
**Safety note**: For commands that take `[social_set_id] <draft_id>`, if you pass only a single argument (the draft_id) while a default social set is configured, you must add `--use-default` to confirm intent.

| Command | Description |
|---------|-------------|
| `typefully drafts list [social_set_id]` | List drafts (add `--status scheduled` to filter, `--sort` to order) |
| `typefully drafts get [social_set_id] <draft_id>` | Get a specific draft with full content (single-arg requires `--use-default` if a default is configured) |
| `typefully drafts create [social_set_id] --text "..."` | Create a new draft (auto-selects platform) |
| `typefully drafts create [social_set_id] --platform x --text "..."` | Create a draft for specific platform(s) |
| `typefully drafts create [social_set_id] --all --text "..."` | Create a draft for all connected platforms |
| `typefully drafts create [social_set_id] --file <path>` | Create draft from file content |
| `typefully drafts create ... --media <media_ids>` | Create draft with attached media |
| `typefully drafts create ... --reply-to <url>` | Reply to an existing X post |
| `typefully drafts create ... --community <id>` | Post to an X community |
| `typefully drafts create ... --share` | Generate a public share URL for the draft |
| `typefully drafts create ... --scratchpad "..."` | Add internal notes/scratchpad to the draft |
| `typefully drafts update [social_set_id] <draft_id> --text "..."` | Update an existing draft (single-arg requires `--use-default` if a default is configured) |
| `typefully drafts update [social_set_id] <draft_id> --tags "tag1,tag2"` | Update tags on an existing draft (content unchanged) |
| `typefully drafts update ... --share` | Generate a public share URL for the draft |
| `typefully drafts update ... --scratchpad "..."` | Update internal notes/scratchpad |
| `typefully drafts update [social_set_id] <draft_id> --append --text "..."` | Append to existing thread |

### Scheduling & Publishing

**Safety note**: These commands require `--use-default` when using the default social set with a single argument (to prevent accidental operations from ambiguous syntax).

| Command | Description |
|---------|-------------|
| `typefully drafts delete <social_set_id> <draft_id>` | Delete a draft (explicit IDs) |
| `typefully drafts delete <draft_id> --use-default` | Delete using default social set |
| `typefully drafts schedule <social_set_id> <draft_id> --time next-free-slot` | Schedule to next available slot |
| `typefully drafts schedule <draft_id> --time next-free-slot --use-default` | Schedule using default social set |
| `typefully drafts publish <social_set_id> <draft_id>` | Publish immediately |
| `typefully drafts publish <draft_id> --use-default` | Publish using default social set |

### Tags

| Command | Description |
|---------|-------------|
| `typefully tags list [social_set_id]` | List all tags |
| `typefully tags create [social_set_id] --name "Tag Name"` | Create a new tag |

### Media

| Command | Description |
|---------|-------------|
| `typefully media upload <file_path> [social_set_id]` | Upload media, wait for processing, return ready media_id |
| `typefully media upload <file_path> --no-wait` | Upload and return immediately (use media status to poll) |
| `typefully media upload <file_path> --timeout <seconds>` | Set custom timeout (default: 60) |
| `typefully media status <media_id> [social_set_id]` | Check media upload status |

### Setup & Configuration

| Command | Description |
|---------|-------------|
| `typefully setup` | Interactive setup - prompts for API key, storage location, and default social set |
| `typefully setup --key <key> --location <global\|local>` | Non-interactive setup for scripts/CI (auto-selects default if only one social set) |
| `typefully setup --key <key> --default-social-set <id>` | Non-interactive setup with explicit default social set |
| `typefully setup --key <key> --no-default` | Non-interactive setup, skip default social set selection |
| `typefully config show` | Show current config, API key source, and default social set |
| `typefully config set-default [social_set_id]` | Set default social set (interactive if ID omitted) |
| `typefully config set-platforms` | Set default platforms used when creating drafts (interactive multiselect) |
| `typefully config set-platforms --platforms x,linkedin` | Set default platforms non-interactively |

### Shortcuts (`tfly`)

`tfly` is a short alias for `typefully`. The default command creates drafts directly:

| Command | Description |
|---------|-------------|
| `tfly "text"` | Create draft instantly with default platforms - no flags needed |
| `tfly` | Interactive flow: prompts for text, platforms (pre-ticked from config), and schedule |
| `tfly rm` | Interactive picker - loads drafts, pick one or more to delete |
| `tfly rm <draft_id>` | Delete a specific draft directly |
| `tfly create-draft "text"` | Full `create-draft` alias with all flag support |
| `tfly update-draft <id> "text"` | Full `update-draft` alias with all flag support |

## Examples

### Set up default social set
```sh
# Check current config
typefully config show

# Set default (interactive - lists available social sets)
typefully config set-default

# Set default (non-interactive)
typefully config set-default 123 --location global
```

### Create a tweet (using default social set)
```sh
typefully drafts create --text "Hello, world!"
```

### Create a tweet with explicit social_set_id
```sh
# Positional
typefully drafts create 123 --text "Hello, world!"

# Flag
typefully drafts create --social-set-id 123 --text "Hello, world!"
```

### Create a cross-platform post (specific platforms)
```sh
typefully drafts create --platform x,linkedin,threads --text "Big announcement!"
```

### Create a post on all connected platforms
```sh
typefully drafts create --all --text "Posting everywhere!"
```

### Create and schedule for next slot
```sh
typefully drafts create --text "Scheduled post" --schedule next-free-slot
```

### Create with tags
```sh
typefully drafts create --text "Marketing post" --tags marketing,product
```

### List scheduled posts sorted by date
```sh
typefully drafts list --status scheduled --sort scheduled_date
```

### Reply to a tweet
```sh
typefully drafts create --platform x --text "Great thread!" --reply-to "https://x.com/user/status/123456"
```

### Post to an X community
```sh
typefully drafts create --platform x --text "Community update" --community 1493446837214187523
```

### Create draft with share URL
```sh
typefully drafts create --text "Check this out" --share
```

### Create draft with scratchpad notes
```sh
typefully drafts create --text "Launching next week!" --scratchpad "Draft for product launch. Coordinate with marketing team before publishing."
```

### Upload media and create post with it
```sh
# Single command handles upload + polling - returns when ready!
typefully media upload ./image.jpg
# Returns: {"media_id": "abc-123-def", "status": "ready", "message": "Media uploaded and ready"}

# Create post with the media attached
typefully drafts create --text "Check out this image!" --media abc-123-def
```

### Upload multiple media files
```sh
# Upload each file (each waits for processing)
typefully media upload ./photo1.jpg  # Returns media_id: id1
typefully media upload ./photo2.jpg  # Returns media_id: id2

# Create post with multiple media (comma-separated)
typefully drafts create --text "Photo dump!" --media id1,id2
```

### Add media to an existing draft
```sh
# Upload media
typefully media upload ./new-image.jpg  # Returns media_id: xyz

# Update draft with media (456 is the draft_id)
typefully drafts update 456 --text "Updated post with image" --media xyz --use-default
```

### Setup (interactive)
```sh
typefully setup
```

### Setup (non-interactive, for scripts/CI)
```sh
# Auto-selects default social set if only one exists
typefully setup --key typ_xxx --location global

# With explicit default social set
typefully setup --key typ_xxx --location global --default-social-set 123

# Skip default social set selection entirely
typefully setup --key typ_xxx --no-default
```

## Platform Names

Use these exact names for the `--platform` option:
- `x` - X (formerly Twitter)
- `linkedin` - LinkedIn
- `threads` - Threads
- `bluesky` - Bluesky
- `mastodon` - Mastodon

## Draft URLs

Typefully draft URLs contain the social set and draft IDs:
```
https://typefully.com/?a=<social_set_id>&d=<draft_id>
```

Example: `https://typefully.com/?a=12345&d=67890`
- `a=12345` → social_set_id
- `d=67890` → draft_id

## Draft Scratchpad

**When the user explicitly asks to add notes, ideas, or anything else in the draft scratchpad, use the `--scratchpad` flag - do NOT write to local files!**

The `--scratchpad` option attaches internal notes directly to the Typefully draft. These notes:
- Are visible in the Typefully UI alongside the draft
- Stay attached to the draft permanently
- Are private and never published to social media
- Are perfect for storing thread expansion ideas, research notes, context, etc.

```sh
# CORRECT: Notes attached to the draft in Typefully
typefully drafts create --social-set-id 123 --text "My post" --scratchpad "Ideas for expanding: 1) Add stats 2) Include quote"

# WRONG: Do NOT write notes to local files when the user wants them in Typefully
# Writing to /tmp/scratchpad/ or any local file is NOT the same thing
```

## Automation Guidelines

When automating posts, especially on X, follow these rules to keep accounts in good standing:

- **No duplicate content** across multiple accounts
- **No unsolicited automated replies** - only reply when explicitly requested by the user
- **No trending manipulation** - don't mass-post about trending topics
- **No fake engagement** - don't automate likes, reposts, or follows
- **Respect rate limits** - the API has rate limits, don't spam requests
- **Drafts are private** - content stays private until published or explicitly shared

When in doubt, create drafts for user review rather than publishing directly.

**Publishing confirmation**: Unless the user explicitly asks to "publish now" or "post immediately", always confirm before publishing. Creating a draft is safe; publishing is irreversible and goes public instantly.

## Tips

- **Smart platform default**: If `--platform` is omitted, the first connected platform is auto-selected
- **Default platforms config**: Run `typefully config set-platforms` to save preferred platforms (e.g. `x,linkedin,threads`) - used automatically on every new draft
- **Short alias**: Use `tfly` instead of `typefully` for all commands
- **Interactive mode**: Run `tfly` with no args to get a guided prompt for text, platforms, and schedule
- **Delete interactively**: `tfly rm` loads your drafts and lets you pick which to delete
- **All platforms**: Use `--all` to post to all connected platforms at once
- **Character limits**: X (280), LinkedIn (3000), Threads (500), Bluesky (300), Mastodon (500)
- **Thread creation**: Use `---` on its own line to split into multiple posts (thread)
- **Scheduling**: Use `next-free-slot` to let Typefully pick the optimal time
- **Cross-posting**: List multiple platforms separated by commas: `--platform x,linkedin`
- **Draft titles**: Use `--title` for internal organization (not posted to social media)
- **Draft scratchpad**: Use `--scratchpad` to attach notes to the draft in Typefully (NOT local files!) - perfect for thread ideas, research, context
- **Read from file**: Use `--file ./post.txt` instead of `--text` to read content from a file
- **Sorting drafts**: Use `--sort` with values like `created_at`, `-created_at`, `scheduled_date`, etc.
- **JSON output**: Add `--json` to any command for raw JSON output (useful for scripting)
