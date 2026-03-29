import { resolve } from "path";
import { fetchStatuteXml } from "../api/justice-laws.js";
import { getConfig } from "../config.js";
import { checkoutMain, commitFile, push } from "../git/operations.js";
import { gitExec } from "../git/operations.js";
import { parseStatuteXml } from "../parsers/justice-laws-xml.js";

const TARGET_STATUTES = [
  { actId: "B-9.01", slug: "broadcasting-act" },
  { actId: "C-46", slug: "criminal-code" },
  { actId: "E-2.01", slug: "canada-elections-act" },
  { actId: "L-2", slug: "canada-labour-code" },
  { actId: "A-1", slug: "access-to-information-act" },
  { actId: "P-21", slug: "privacy-act" },
  { actId: "C-29", slug: "canadian-human-rights-act" },
  { actId: "I-21", slug: "interpretation-act" },
];

const SEED_AUTHOR = "Parliament of Canada <info@parl.gc.ca>";

export async function seed(): Promise<void> {
  const config = getConfig();
  const lawsRepoPath = resolve(config.LAWS_REPO_PATH);

  console.log("🌱 Seeding canadian-laws with consolidated statutes...");
  console.log(`📂 Laws repo path: ${lawsRepoPath}`);

  await checkoutMain(lawsRepoPath);

  // Ensure statutes directory exists
  const statutesDir = resolve(lawsRepoPath, "statutes");
  await Bun.write(resolve(statutesDir, ".gitkeep"), "");

  let successCount = 0;
  let failCount = 0;

  for (const { actId, slug } of TARGET_STATUTES) {
    try {
      console.log(`\n📥 Fetching ${actId} (${slug})...`);
      const xml = await fetchStatuteXml(actId);

      console.log("  🔄 Parsing XML → Markdown...");
      const { metadata, markdown } = parseStatuteXml(xml, actId);

      const filePath = resolve(statutesDir, `${slug}.md`);
      await Bun.write(filePath, markdown);
      console.log(`  📝 Wrote ${filePath}`);

      const relativePath = `statutes/${slug}.md`;
      await commitFile(
        relativePath,
        `feat: add ${metadata.shortTitle || metadata.longTitle}\n\nAct ID: ${actId}\nSource: https://laws-lois.justice.gc.ca/eng/acts/${actId.toLowerCase()}/`,
        SEED_AUTHOR,
        lawsRepoPath,
      );
      console.log(`  ✅ Committed ${metadata.shortTitle || slug}`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed to process ${actId}: ${error}`);
      failCount++;
    }
  }

  console.log(
    `\n📊 Seed complete: ${successCount} succeeded, ${failCount} failed`,
  );

  if (successCount > 0) {
    console.log("\n🚀 Pushing to origin...");
    // Record current HEAD so we can rollback on push failure
    const headBefore = (await gitExec(["rev-parse", "HEAD"], lawsRepoPath)).trim();
    try {
      await push("main", lawsRepoPath);
      console.log("✅ Pushed to origin/main");
    } catch (pushError) {
      console.error(`❌ Push failed: ${pushError}`);
      console.log("🔄 Rolling back local commits...");
      try {
        // Find the commit before our seed commits
        const originMain = (await gitExec(["rev-parse", "origin/main"], lawsRepoPath)).trim();
        await gitExec(["reset", "--hard", originMain], lawsRepoPath);
        console.log("✅ Rolled back to origin/main. Local repo is clean.");
      } catch (rollbackError) {
        console.error(`❌ Rollback also failed: ${rollbackError}`);
        console.error(`   Manual fix: cd ${lawsRepoPath} && git reset --hard origin/main`);
      }
    }
  }
}
