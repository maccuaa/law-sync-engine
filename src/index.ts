#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("law-sync-engine")
  .description("Sync Canadian parliamentary legislation to Git/GitHub")
  .version("0.1.0");

program
  .command("seed")
  .description("Seed the canadian-laws repo with consolidated statutes")
  .option("--all", "Seed all ~900 acts from Justice Laws index")
  .option(
    "--limit <n>",
    "Maximum number of statutes to seed (use with --all)",
    Number.parseInt,
  )
  .option("--act <id>", "Seed a single act by Justice Laws ID (e.g. C-46)")
  .action(async (opts) => {
    const { seed } = await import("./commands/seed.js");
    await seed({
      all: opts.all,
      limit: opts.limit,
      act: opts.act,
    });
  });

program
  .command("sync")
  .description("Detect new bills and create PRs in canadian-laws")
  .option("--limit <n>", "Maximum number of bills to process", Number.parseInt)
  .option("--bill <number>", "Sync a single bill (e.g. C-2)")
  .option("--dry-run", "Show what would happen without making changes")
  .action(async (opts) => {
    const { sync } = await import("./commands/sync.js");
    await sync({
      limit: opts.limit,
      bill: opts.bill,
      dryRun: opts.dryRun,
    });
  });

program
  .command("update-board")
  .description("Update GitHub Project board based on bill statuses")
  .action(async () => {
    const { updateBoard } = await import("./commands/update-board.js");
    await updateBoard();
  });

program.parse();
