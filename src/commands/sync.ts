import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchBillXml, getBillXmlUrl } from "../api/legisinfo.js";
import type { Bill } from "../api/openparliament.js";
import {
  getBill,
  getCurrentSession,
  getPolitician,
  listBills,
} from "../api/openparliament.js";
import { getConfig } from "../config.js";
import {
  branchExists,
  checkoutMain,
  commitFile,
  createBranch,
  gitReset,
  push,
} from "../git/operations.js";
import {
  addLabels,
  createPullRequest,
  findPullRequestByHead,
} from "../github/rest.js";
import { parseBillXml } from "../parsers/bill-xml.js";
import {
  extractAffectedStatutes,
  safeBranchName,
  safeFilePath,
  sanitizeForGit,
  sanitizeGitAuthor,
  validateBillNumber,
} from "../validation.js";

export interface SyncOptions {
  limit?: number;
  bill?: string;
  dryRun?: boolean;
}

export async function sync(options: SyncOptions = {}): Promise<void> {
  const config = getConfig();
  const lawsRepoPath = resolve(config.LAWS_REPO_PATH);
  const owner = config.GITHUB_OWNER;
  const repo = config.LAWS_REPO;

  console.log("🔄 Syncing bills from OpenParliament...");

  const session = config.SESSION || (await getCurrentSession());
  console.log(`📅 Current session: ${session}`);

  let bills = await listBills(session);
  console.log(`📋 Found ${bills.length} bills in session ${session}`);

  // Apply scope filters
  if (options.bill) {
    const target = options.bill.toUpperCase();
    bills = bills.filter((b) => b.number.toUpperCase() === target);
    if (bills.length === 0) {
      console.error(`❌ Bill ${target} not found in session ${session}`);
      return;
    }
    console.log(`🎯 Filtering to single bill: ${target}`);
  }
  if (options.limit && options.limit > 0) {
    bills = bills.slice(0, options.limit);
    console.log(`🔢 Limiting to ${options.limit} bills`);
  }
  if (options.dryRun) {
    console.log("🧪 Dry run mode — no changes will be made");
  }

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
        // Branch exists — but does a PR exist too?
        const existingPr = await findPullRequestByHead(owner, repo, branchName);
        if (existingPr) {
          skipCount++;
          continue;
        }
        // Branch exists but no PR — recover by creating the PR
        console.log(
          `\n🔧 Recovering orphan branch ${branchName} — creating PR...`,
        );
        let fullBill = bill;
        try {
          fullBill = await getBill(session, validatedNumber);
        } catch {
          // Use list data as fallback
        }
        const safeTitle = sanitizeForGit(
          fullBill.short_title?.en || fullBill.name.en,
        );
        let author = "Parliament of Canada <info@parl.gc.ca>";
        if (fullBill.sponsor_politician_url) {
          try {
            const politician = await getPolitician(
              fullBill.sponsor_politician_url,
            );
            if (politician.email) {
              author = sanitizeGitAuthor(politician.name, politician.email);
            }
          } catch {
            // Use default author
          }
        }
        try {
          const prBody = buildPrBody(fullBill, session, author);
          if (options.dryRun) {
            console.log(`  🧪 Would create PR for orphan branch ${branchName}`);
            newCount++;
          } else {
            const pr = await createPullRequest({
              owner,
              repo,
              title: `Bill ${validatedNumber}: ${safeTitle}`,
              body: prBody,
              head: branchName,
              base: "main",
            });
            console.log(`  📝 Recovered PR #${pr.number}: ${pr.html_url}`);
            const labels = ["bill", session];
            if (fullBill.home_chamber === "House") labels.push("house");
            if (fullBill.home_chamber === "Senate") labels.push("senate");
            try {
              await addLabels(owner, repo, pr.number, labels);
            } catch {
              // Non-fatal
            }
            // Gentle delay to avoid GitHub secondary rate limits
            await new Promise((r) => setTimeout(r, 1000));
            newCount++;
          }
        } catch (e) {
          console.error(`  ❌ Failed to recover PR for ${branchName}: ${e}`);
          failCount++;
        }
        continue;
      }

      console.log(
        `\n🆕 New bill: ${validatedNumber} — ${sanitizeForGit(bill.name.en)}`,
      );

      // Fetch full bill details (list endpoint only has minimal fields)
      let fullBill = bill;
      try {
        fullBill = await getBill(session, validatedNumber);
      } catch (e) {
        console.warn(`  ⚠️ Could not fetch bill details, using list data: ${e}`);
      }

      // Fetch sponsor MP details
      let author = "Parliament of Canada <info@parl.gc.ca>";
      if (fullBill.sponsor_politician_url) {
        try {
          const politician = await getPolitician(
            fullBill.sponsor_politician_url,
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
        const safeTitle = sanitizeForGit(
          fullBill.short_title?.en || fullBill.name.en,
        );
        markdown = [
          "---",
          `bill_number: "${validatedNumber}"`,
          `title: "${safeTitle}"`,
          `session: "${session}"`,
          `introduced: "${fullBill.introduced || "unknown"}"`,
          "---",
          "",
          `# Bill ${validatedNumber} — ${safeTitle}`,
          "",
          `> ${sanitizeForGit(fullBill.name.en)}`,
          "",
          "*Bill text not yet available in XML format.*",
          "",
          `[View on LEGISinfo](https://www.parl.ca/legisinfo/en/bill/${session}/${validatedNumber.toLowerCase()})`,
          `[View on OpenParliament](https://openparliament.ca${fullBill.url})`,
          "",
        ].join("\n");
      }

      if (options.dryRun) {
        const safeTitle = sanitizeForGit(
          fullBill.short_title?.en || fullBill.name.en,
        );
        console.log(
          `  🧪 Would create branch ${branchName}, commit, and open PR: "Bill ${validatedNumber}: ${safeTitle}"`,
        );
        console.log(`  🧪 Author: ${author}`);
        console.log(
          `  🧪 Chamber: ${fullBill.home_chamber || "Unknown"}, XML: ${xmlUrl ? "yes" : "no"}`,
        );
        newCount++;
        continue;
      }

      // Create branch and commit
      await checkoutMain(lawsRepoPath);
      await createBranch(branchName, lawsRepoPath);

      const relativePath = safeFilePath(
        `bills/${session}`,
        validatedNumber.toLowerCase(),
      );
      await mkdir(resolve(lawsRepoPath, `bills/${session}`), {
        recursive: true,
      });
      const filePath = resolve(lawsRepoPath, relativePath);
      await Bun.write(filePath, markdown);

      const safeTitle = sanitizeForGit(
        fullBill.short_title?.en || fullBill.name.en,
      );
      const sponsorName = sanitizeForGit(author.split(" <")[0]);
      await commitFile(
        relativePath,
        `feat: introduce Bill ${validatedNumber} — ${safeTitle}\n\nSponsored by: ${sponsorName}\nSession: ${session}\nIntroduced: ${fullBill.introduced || "unknown"}`,
        author,
        lawsRepoPath,
      );

      await push(branchName, lawsRepoPath);
      console.log(`  📤 Pushed branch ${branchName}`);

      // Create PR
      const prBody = buildPrBody(fullBill, session, author);

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
      if (fullBill.home_chamber === "House") labels.push("house");
      if (fullBill.home_chamber === "Senate") labels.push("senate");
      try {
        await addLabels(owner, repo, pr.number, labels);
      } catch (e) {
        console.warn(`  ⚠️ Could not add labels: ${e}`);
      }

      // Gentle delay to avoid GitHub secondary rate limits
      await new Promise((r) => setTimeout(r, 1000));

      await checkoutMain(lawsRepoPath);
      newCount++;
    } catch (error) {
      console.error(`  ❌ Failed to process ${bill.number}: ${error}`);
      try {
        await gitReset(lawsRepoPath);
        await checkoutMain(lawsRepoPath);
      } catch (resetError) {
        console.error(`  💀 Git state corrupted, aborting sync: ${resetError}`);
        throw new Error(
          `Git recovery failed after processing ${bill.number}: ${resetError}`,
        );
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

  const lines = [
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
  ];

  // Add affected statutes section
  const affectedSlugs = extractAffectedStatutes(longTitle);
  if (affectedSlugs.length > 0) {
    lines.push("");
    lines.push("### Affected Statutes");
    lines.push("");
    lines.push("This bill may amend the following statutes:");
    for (const slug of affectedSlugs) {
      lines.push(
        `- [\`${slug}.md\`](https://github.com/maccuaa/canadian-laws/blob/main/statutes/${slug}.md)`,
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(
    "*This PR was automatically created by [law-sync-engine](https://github.com/maccuaa/law-sync-engine).*",
  );

  return lines.filter(Boolean).join("\n");
}
