import { mkdir } from "fs/promises";
import { resolve } from "path";
import { fetchBillXml, getBillXmlUrl } from "../api/legisinfo.js";
import {
  getCurrentSession,
  getPolitician,
  listBills,
} from "../api/openparliament.js";
import type { Bill } from "../api/openparliament.js";
import { getConfig } from "../config.js";
import {
  branchExists,
  checkoutMain,
  commitFile,
  createBranch,
  push,
} from "../git/operations.js";
import { addLabels, createPullRequest } from "../github/rest.js";
import { parseBillXml } from "../parsers/bill-xml.js";
import {
  safeBranchName,
  safeFilePath,
  sanitizeForGit,
  sanitizeGitAuthor,
  validateBillNumber,
} from "../validation.js";

export async function sync(): Promise<void> {
  const config = getConfig();
  const lawsRepoPath = resolve(config.LAWS_REPO_PATH);
  const owner = config.GITHUB_OWNER;
  const repo = config.LAWS_REPO;

  console.log("🔄 Syncing bills from OpenParliament...");

  const session = await getCurrentSession();
  console.log(`📅 Current session: ${session}`);

  const bills = await listBills(session);
  console.log(`📋 Found ${bills.length} bills in session ${session}`);

  let newCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const bill of bills) {
    try {
      // Validate bill number before any operations
      const validatedNumber = validateBillNumber(bill.number);
      const branchName = safeBranchName(validatedNumber);

      const exists = await branchExists(branchName, lawsRepoPath);
      if (exists) {
        skipCount++;
        continue;
      }

      console.log(`\n🆕 New bill: ${validatedNumber} — ${sanitizeForGit(bill.name.en)}`);

      // Fetch sponsor MP details
      let author = "Parliament of Canada <info@parl.gc.ca>";
      if (bill.sponsor_politician_url) {
        try {
          const politician = await getPolitician(
            bill.sponsor_politician_url,
          );
          if (politician.email) {
            author = sanitizeGitAuthor(politician.name, politician.email);
          }
          console.log(`  👤 Sponsor: ${politician.name}`);
        } catch (e) {
          console.warn(`  ⚠️ Could not fetch sponsor info: ${e}`);
        }
      }

      // Fetch bill XML
      let markdown: string;
      const xmlUrl = await getBillXmlUrl(session, validatedNumber);
      if (xmlUrl) {
        console.log("  📥 Fetching bill XML...");
        const xml = await fetchBillXml(xmlUrl);
        const parsed = parseBillXml(xml);
        markdown = parsed.markdown;
      } else {
        console.warn("  ⚠️ No XML available, creating placeholder");
        const safeTitle = sanitizeForGit(bill.short_title?.en || bill.name.en);
        markdown = [
          "---",
          `bill_number: "${validatedNumber}"`,
          `title: "${safeTitle}"`,
          `session: "${session}"`,
          `introduced: "${bill.introduced || "unknown"}"`,
          "---",
          "",
          `# Bill ${validatedNumber} — ${safeTitle}`,
          "",
          `> ${sanitizeForGit(bill.name.en)}`,
          "",
          "*Bill text not yet available in XML format.*",
          "",
          `[View on LEGISinfo](https://www.parl.ca/legisinfo/en/bill/${session}/${validatedNumber.toLowerCase()})`,
          `[View on OpenParliament](https://openparliament.ca${bill.url})`,
          "",
        ].join("\n");
      }

      // Create branch and commit
      await checkoutMain(lawsRepoPath);
      await createBranch(branchName, lawsRepoPath);

      const relativePath = safeFilePath("bills", validatedNumber.toLowerCase());
      await mkdir(resolve(lawsRepoPath, "bills"), { recursive: true });
      const filePath = resolve(lawsRepoPath, relativePath);
      await Bun.write(filePath, markdown);

      const safeTitle = sanitizeForGit(bill.short_title?.en || bill.name.en);
      const sponsorName = sanitizeForGit(author.split(" <")[0]);
      await commitFile(
        relativePath,
        `feat: introduce Bill ${validatedNumber} — ${safeTitle}\n\nSponsored by: ${sponsorName}\nSession: ${session}\nIntroduced: ${bill.introduced || "unknown"}`,
        author,
        lawsRepoPath,
      );

      await push(branchName, lawsRepoPath);
      console.log(`  📤 Pushed branch ${branchName}`);

      // Create PR
      const prBody = buildPrBody(bill, session, author);

      const pr = await createPullRequest({
        owner,
        repo,
        title: `Bill ${validatedNumber}: ${safeTitle}`,
        body: prBody,
        head: branchName,
        base: "main",
      });
      console.log(`  📝 Created PR #${pr.number}: ${pr.html_url}`);

      // Add labels
      const labels = ["bill", session];
      if (bill.home_chamber === "House") labels.push("house");
      if (bill.home_chamber === "Senate") labels.push("senate");
      try {
        await addLabels(owner, repo, pr.number, labels);
      } catch (e) {
        console.warn(`  ⚠️ Could not add labels: ${e}`);
      }

      await checkoutMain(lawsRepoPath);
      newCount++;
    } catch (error) {
      console.error(`  ❌ Failed to process ${bill.number}: ${error}`);
      try {
        await checkoutMain(lawsRepoPath);
      } catch {
        /* best-effort return to main */
      }
      failCount++;
    }
  }

  console.log(
    `\n📊 Sync complete: ${newCount} new, ${skipCount} existing, ${failCount} failed`,
  );
}

function buildPrBody(bill: Bill, session: string, author: string): string {
  const shortTitle = bill.short_title?.en || "";
  const longTitle = bill.name.en;
  const sponsorName = author.split(" <")[0];

  return [
    `## ${longTitle}`,
    "",
    shortTitle ? `**Short Title:** ${shortTitle}` : "",
    `**Bill Number:** ${bill.number}`,
    `**Session:** ${session}`,
    `**Introduced:** ${bill.introduced || "Unknown"}`,
    `**Sponsor:** ${sponsorName}`,
    `**Chamber:** ${bill.home_chamber || "Unknown"}`,
    "",
    "### Links",
    "",
    `- [OpenParliament](https://openparliament.ca${bill.url})`,
    `- [LEGISinfo](https://www.parl.ca/legisinfo/en/bill/${session}/${bill.number.toLowerCase()})`,
    bill.text_url ? `- [Full Text](${bill.text_url})` : "",
    "",
    "---",
    "*This PR was automatically created by [law-sync-engine](https://github.com/maccuaa/law-sync-engine).*",
  ]
    .filter(Boolean)
    .join("\n");
}
