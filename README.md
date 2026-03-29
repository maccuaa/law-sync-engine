# law-sync-engine

A Bun/TypeScript CLI that polls Canadian government APIs, parses legislative XML, and automates Git + GitHub workflows to represent the parliamentary process.

## Setup

```bash
bun install
cp .env.example .env
# Edit .env with your GitHub token
```

## Commands

```bash
# Seed canadian-laws repo with consolidated statutes
bun run seed

# Detect new bills and create PRs
bun run sync

# Update GitHub Project board positions
bun run update-board
```

## GitHub Actions

Three workflows automate the sync pipeline:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI** (`ci.yml`) | Push / PR to `main` | Runs `bun test` |
| **Daily Sync** (`sync.yml`) | Cron (noon UTC) + manual | Clones `canadian-laws`, runs `sync` + `update-board` |
| **Seed Statutes** (`seed.yml`) | Manual only | One-time seeding of consolidated statutes |

### Required secrets

| Secret | Description |
|--------|-------------|
| `LAWS_SYNC_TOKEN` | GitHub PAT with **`repo`** + **`project`** scopes (the default `GITHUB_TOKEN` cannot push to another repo) |

### Required variables

| Variable | Description |
|----------|-------------|
| `PROJECT_NUMBER` | GitHub Project board number (defaults to `1`) |

### Manual triggers

Go to **Actions → \<workflow\> → Run workflow** in the GitHub UI, or use the CLI:

```bash
gh workflow run sync.yml
gh workflow run seed.yml
```

## Architecture

- `src/commands/` — CLI command handlers
- `src/parsers/` — XML-to-Markdown converters
- `src/api/` — Government API clients (OpenParliament, LEGISinfo, Justice Laws)
- `src/github/` — GitHub REST + GraphQL clients
- `src/git/` — Local git operations
