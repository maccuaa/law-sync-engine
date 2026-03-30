# AGENTS.md

## Project Overview

`law-sync-engine` is a Bun/TypeScript CLI that syncs Canadian parliamentary legislation into the [`canadian-laws`](https://github.com/maccuaa/canadian-laws) repository. It polls government APIs, parses legislative XML into Markdown, and automates Git + GitHub workflows (branches, PRs, Project board).

## Tech Stack

- **Runtime:** Bun (not Node.js)
- **Language:** TypeScript (strict mode)
- **Test runner:** `bun test` (built-in, Vitest-compatible API)
- **Linter/Formatter:** Biome (`bunx biome check .`)
- **No Python.** This is a TypeScript-only project.

## Key Commands

```bash
bun install          # Install dependencies
bun test             # Run all tests
bunx biome check .   # Lint and format check
bun run seed         # Seed consolidated statutes into canadian-laws
bun run sync         # Detect new bills, create branches + PRs
bun run update-board # Update GitHub Project board positions
```

## Project Structure

```
src/
├── index.ts              # CLI entry point (commander)
├── config.ts             # Env config with Zod validation
├── validation.ts         # Input sanitization (bill numbers, git strings, file paths)
├── commands/
│   ├── seed.ts           # Fetch statutes → parse → commit to main
│   ├── sync.ts           # Poll bills → create branches + PRs
│   └── update-board.ts   # Sync bill statuses → Project board
├── parsers/
│   ├── shared.ts         # Shared XML→Markdown rendering (Section, Heading, etc.)
│   ├── bill-xml.ts       # Bill XML parser (parl.ca DocumentViewer)
│   └── justice-laws-xml.ts # Consolidated statute XML parser (justice.gc.ca)
├── api/
│   ├── openparliament.ts # OpenParliament API client (bills, politicians)
│   ├── legisinfo.ts      # LEGISinfo HTML scraper for bill XML URLs
│   └── justice-laws.ts   # Justice Laws XML fetcher
├── github/
│   ├── rest.ts           # Octokit REST client (PRs, issues, labels)
│   ├── graphql.ts        # GraphQL client (Projects v2 board)
│   └── types.ts          # Shared GitHub types
└── git/
    └── operations.ts     # Local git ops via Bun.spawn
tests/
├── parsers/              # Parser unit tests
├── api/                  # Schema validation tests
├── validation.test.ts    # Input sanitization tests
└── fixtures/             # Sample XML and JSON fixtures
```

## Architecture Notes

- **Two XML formats** with ~80% shared structure: bill XML (parl.ca) and statute XML (justice.gc.ca). Both use `shared.ts` for rendering.
- **Document order preservation:** `fast-xml-parser` with `preserveOrder: true` is used for body rendering so Headings and Sections stay interleaved correctly.
- **Git operations** shell out via `Bun.spawn` with `--author` flags to attribute commits to sponsoring MPs.
- **OpenParliament API** uses `api.openparliament.ca` with `Accept: application/json`, `API-Version: v1`, and a `User-Agent` header per their docs. Rate limited with 429 retry/backoff.
- **Bill XML URLs** must be scraped from parl.ca DocumentViewer HTML — there's no direct XML API.

## External APIs

| API | Base URL | Auth | Notes |
|-----|----------|------|-------|
| OpenParliament | `api.openparliament.ca` | None | Rate limited, set `User-Agent` |
| LEGISinfo / DocumentViewer | `www.parl.ca` | None | HTML scraping for XML links |
| Justice Laws | `laws-lois.justice.gc.ca` | None | Direct XML download |
| GitHub REST | `api.github.com` | `GITHUB_TOKEN` | Via Octokit |
| GitHub GraphQL | `api.github.com/graphql` | `GITHUB_TOKEN` | Projects v2 mutations |

## Environment Variables

See `.env.example`. Required: `GITHUB_TOKEN`. Others have defaults.

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` — Lint + test on push/PR
- `sync.yml` — Daily cron (noon UTC) + manual trigger
- `seed.yml` — Manual-only, one-time statute seeding

Workflows require `LAWS_SYNC_TOKEN` secret (classic PAT with `repo` + `project` scopes).

## Code Style

- Use `node:` protocol for Node.js built-in imports
- Imports between source files use `.js` extension
- Zod v4 imported as `from "zod/v4"`
- All API response fields that may be `null` use `.nullable().optional()` in Zod schemas
- Validate/sanitize all external input before use in git commands or file paths
