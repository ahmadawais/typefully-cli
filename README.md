<img src="https://raw.githubusercontent.com/ahmadawais/typefully-cli/refs/heads/main/.github/cover.svg" alt="Typefully CLI" />


# Typefully CLI

A TypeScript CLI and AI agent skill for drafting, scheduling, and managing social media posts across X, LinkedIn, Threads, Bluesky, and Mastodon.

Built on the [Typefully API](https://typefully.com/docs/api). [Typefully](https://typefully.com) is a writing and scheduling app used by 200k+ top creators and teams to grow on X, LinkedIn, Threads, and Bluesky.

## Setup

### 1. Install

```bash
npm i -g typefully
```

Or use directly with npx:

```bash
npx typefully --help
```

or skills for your AI agent:

```bash
npx skills add ahmadawais/typefully-cli
```

### 2. Copy your API Key

You'll need a Typefully API key. Copy an existing key or create a new one at https://typefully.com/?settings=api

### 3. Run the setup command

This configures your API key and default social set:

```bash
typefully setup
```

> [!TIP]
> You can also set the API key as an environment variable: `export TYPEFULLY_API_KEY=your_key_here` but not needed if you run `typefully setup` which saves it to a config file.

### 4. Start using it

```bash
# Create a tweet
typefully drafts create --text "Hello, world!"

# Quick alias — positional text, no flags needed
typefully create-draft "Hello, world!"

# List scheduled posts
typefully drafts list --status scheduled

# Create a cross-platform post
typefully drafts create --platform x,linkedin --text "Big announcement!"

# Schedule for next available slot
typefully drafts create --text "Scheduled post" --schedule next-free-slot

# Output raw JSON (for scripts/pipes)
typefully drafts list --json
```

<img src="https://raw.githubusercontent.com/ahmadawais/typefully-cli/refs/heads/main/.github/image.svg" alt="Typefully CLI" />


## Output Modes

By default the CLI prints human-readable output with colored formatting. Pass `-j` / `--json` (or pipe stdout) to get raw JSON instead — useful for scripting and automation.

```bash
typefully me                       # human-readable
typefully me --json                # raw JSON
typefully me -j                    # same, short flag
typefully drafts list | jq '.results[0]'   # auto JSON when piped
```

In JSON mode the banner and spinners are suppressed — stdout contains only the JSON payload.

## Commands

### Global flags

| Flag | Description |
|------|-------------|
| `-v, --version` | Show version |
| `-j, --json` | Output raw JSON instead of human-readable text |

### Setup & Configuration

```bash
typefully setup                                          # interactive
typefully setup --key typ_xxx --location global         # non-interactive
typefully setup --key typ_xxx --scope local             # --scope is an alias for --location
typefully setup --key typ_xxx --default-social-set 123
typefully setup --key typ_xxx --no-default

typefully config show
typefully config set-default                            # interactive
typefully config set-default 123 --location global
typefully config set-default 123 --scope local         # --scope is an alias for --location
```

### User & Social Sets

```bash
typefully me
typefully social-sets list
typefully social-sets get [social_set_id]
```

### Drafts

```bash
# List
typefully drafts list
typefully drafts list --status scheduled
typefully drafts list --tag product --limit 20
typefully drafts list --sort -created_at

# Get
typefully drafts get <draft_id> --use-default
typefully drafts get <social_set_id> <draft_id>

# Create
typefully drafts create --text "Post content"
typefully drafts create -f ./post.txt                  # -f is short for --file
typefully drafts create --text "..." --platform x,linkedin
typefully drafts create --text "..." --all             # all connected platforms
typefully drafts create --text "..." --schedule next-free-slot
typefully drafts create --text "..." --notes "Draft notes"   # --notes = --scratchpad

# Update
typefully drafts update <draft_id> --text "New text" --use-default
typefully drafts update <draft_id> -a --text "New post" --use-default  # -a = --append
typefully drafts update <draft_id> -f ./updated.txt --use-default

# Delete / Schedule / Publish
typefully drafts delete <draft_id> --use-default
typefully drafts schedule <draft_id> --time next-free-slot --use-default
typefully drafts publish <draft_id> --use-default
```

### Aliases (agent-friendly)

`create-draft` and `update-draft` are top-level aliases with positional text — useful for agents and scripts where flags feel verbose.

```bash
# create-draft: positional text + --social-set-id
typefully create-draft "Hello, world!"
typefully create-draft "Big announcement!" --platform x,linkedin
typefully create-draft "Thread post" --schedule next-free-slot
typefully create-draft --file ./post.txt --platform x

# update-draft: positional draft_id + optional positional text
typefully update-draft <draft_id> "Updated text"
typefully update-draft <draft_id> --append "New thread post"
typefully update-draft <draft_id> -f ./updated.txt
```

Both aliases support all the same options as their `drafts create` / `drafts update` equivalents, plus `--social-set-id <id>` to override the default.

### Tags

```bash
typefully tags list
typefully tags list <social_set_id>
typefully tags create --name "Product"
```

### Media

```bash
typefully media upload ./image.jpg                     # waits for processing
typefully media upload ./image.jpg --no-wait           # returns immediately
typefully media upload ./image.jpg --timeout 120       # custom timeout (seconds)
typefully media status <media_id>
```

## Thread Syntax

Use `---` on its own line to split a draft into a thread:

```bash
typefully drafts create --text "First post

---

Second post in the thread

---

Third post"
```

## Config File Format

Config files are stored as JSON with `0600` permissions:

```json
{
  "apiKey": "typ_xxxx",
  "defaultSocialSetId": 12345
}
```

**Priority order** (highest wins):
1. `TYPEFULLY_API_KEY` environment variable
2. `./.typefully/config.json` (project-local)
3. `~/.config/typefully/config.json` (user-global)

## AI Agent Skill

This package also includes an AI agent skill for use with Claude Code, Cursor, and other AI coding assistants.

### Install the skill

**CLI** (works with Claude Code, Cursor, Windsurf, and many other agents):

```bash
npx skills add ahmadawais/typefully-cli
```

## Supported Platforms

| Platform | `--platform` value |
|----------|-------------------|
| X (Twitter) | `x` |
| LinkedIn | `linkedin` |
| Threads | `threads` |
| Bluesky | `bluesky` |
| Mastodon | `mastodon` |

## Links

- [Typefully](https://typefully.com)
- [API Documentation](https://typefully.com/docs/api)
- [CLI Spec](./CLI-SPEC.md)

## License

MIT
