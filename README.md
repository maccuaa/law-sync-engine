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

## Architecture

- `src/commands/` — CLI command handlers
- `src/parsers/` — XML-to-Markdown converters
- `src/api/` — Government API clients (OpenParliament, LEGISinfo, Justice Laws)
- `src/github/` — GitHub REST + GraphQL clients
- `src/git/` — Local git operations
