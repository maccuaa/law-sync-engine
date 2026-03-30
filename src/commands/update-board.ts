import { resolve } from "node:path";
import { lookupActId } from "../api/acts-registry.js";
import { fetchStatuteXml } from "../api/justice-laws.js";
import type { Bill } from "../api/openparliament.js";
import {
  getBill,
  getCurrentSession,
  listBills,
} from "../api/openparliament.js";
import type { BoardColumn } from "../config.js";
import { getConfig } from "../config.js";
import { commitFile, pullMain, push } from "../git/operations.js";
import {
  addItemToProject,
  getProjectId,
  getProjectItems,
  updateItemField,
} from "../github/graphql.js";
import {
  closePullRequest,
  deleteBranch,
  listOpenPullRequests,
  mergePullRequest,
} from "../github/rest.js";
import { parseStatuteXml } from "../parsers/justice-laws-xml.js";
import { extractAffectedStatutes } from "../validation.js";

// Map OpenParliament status_code values to board columns.
// Source: https://github.com/michaelmulley/openparliament
const STATUS_CODE_MAP: Record<string, BoardColumn> = {
  Introduced: "First Reading",
  HouseAtFirstReading: "First Reading",
  HouseAt2ndReading: "Second Reading",
  HousePassed2ndReading: "Second Reading",
  HouseInCommittee: "Committee",
  HouseCommitteeReported: "Report Stage",
  HouseAtReportStage: "Report Stage",
  HouseAt3rdReading: "Third Reading",
  HousePassed3rdReading: "Third Reading",
  SenateAtFirstReading: "Senate",
  SenateAt2ndReading: "Senate",
  SenateInCommittee: "Senate",
  SenateAt3rdReading: "Senate",
  SenatePassed3rdReading: "Senate",
  RoyalAssentGiven: "Royal Assent",
  BillDefeated: "Defeated",
  BillWithdrawn: "Defeated",
  BillNotProceededWith: "Defeated",
};

const STATUTE_AUTHOR = "Parliament of Canada <info@parl.gc.ca>";

export function mapStatusToColumn(bill: Bill): BoardColumn {
  if (bill.law) return "Royal Assent";
  if (bill.status_code) {
    const mapped = STATUS_CODE_MAP[bill.status_code];
    if (mapped) return mapped;
  }
  return "First Reading";
}

export async function updateBoard(): Promise<void> {
  const config = getConfig();
  const owner = config.GITHUB_OWNER;
  const repo = config.LAWS_REPO;
  const projectNumber = config.PROJECT_NUMBER;

  console.log("📋 Updating Project board...");

  // 1. Get project ID and fields in one call
  const project = await getProjectId(owner, projectNumber);
  if (!project) {
    console.error(
      "❌ Project not found. Create it first or set PROJECT_NUMBER env var.",
    );
    return;
  }
  console.log(`  📊 Found project: ${project.title}`);

  // 2. Find the "Stage" field (prefer over generic "Status")
  const stageField =
    project.fields.find((f) => f.name === "Stage") ||
    project.fields.find((f) => f.name === "Status");
  if (!stageField?.options) {
    console.error(
      "❌ No 'Stage' or 'Status' single-select field found on the project.",
    );
    console.log(
      "  Available fields:",
      project.fields.map((f) => f.name).join(", "),
    );
    return;
  }
  console.log(
    `  🏷️ Stage field: ${stageField.name} with ${stageField.options.length} options`,
  );

  const optionsByName = new Map(stageField.options.map((o) => [o.name, o.id]));

  // 3. Get existing project items
  const existingItems = await getProjectItems(project.id);
  const itemsByPrNumber = new Map(
    existingItems
      .filter((item) => item.content?.number)
      .map((item) => [item.content?.number, item]),
  );

  // 4. Get open PRs (Octokit returns node_id)
  const openPrs = await listOpenPullRequests(owner, repo);
  console.log(`  📝 Found ${openPrs.length} open PRs`);

  // 5. Get current session bills (list endpoint for quick lookup)
  const session = config.SESSION || (await getCurrentSession());
  const bills = await listBills(session);
  const billsByNumber = new Map(bills.map((b) => [b.number, b]));

  // 6. Reconcile PRs with the board
  let addedCount = 0;
  let movedCount = 0;
  let mergedCount = 0;
  let closedCount = 0;

  for (const pr of openPrs) {
    const billMatch = pr.title.match(/Bill\s+(C-\d+|S-\d+)/i);
    if (!billMatch) continue;

    const billNumber = billMatch[1].toUpperCase();
    let bill = billsByNumber.get(billNumber);

    // Fetch bill detail for status_code (not available in list endpoint)
    if (bill) {
      try {
        bill = await getBill(session, billNumber);
      } catch {
        // Fall back to list data if detail fetch fails
      }
    }

    const targetColumn = bill ? mapStatusToColumn(bill) : "First Reading";

    // Auto-merge on Royal Assent
    if (targetColumn === "Royal Assent") {
      try {
        await mergePullRequest(owner, repo, pr.number);
        console.log(
          `  ✅ Merged PR #${pr.number} (Royal Assent: Bill ${billNumber})`,
        );
        mergedCount++;
      } catch (e) {
        console.warn(`  ⚠️ Failed to merge PR #${pr.number}: ${e}`);
        continue;
      }

      // Delete the bill branch after merge
      try {
        await deleteBranch(owner, repo, pr.head.ref);
        console.log(`  🗑️ Deleted branch ${pr.head.ref}`);
      } catch (e) {
        console.warn(`  ⚠️ Could not delete branch ${pr.head.ref}: ${e}`);
      }

      // Best-effort statute refresh after merge
      try {
        await refreshAffectedStatutes(
          pr.title,
          billNumber,
          pr.number,
          owner,
          repo,
        );
      } catch (e) {
        console.warn(`  ⚠️ Statute refresh failed for PR #${pr.number}: ${e}`);
      }

      continue;
    }

    // Auto-close defeated bills
    if (targetColumn === "Defeated") {
      try {
        await closePullRequest(owner, repo, pr.number);
        console.log(
          `  🚫 Closed PR #${pr.number} (Defeated: Bill ${billNumber})`,
        );
        closedCount++;
      } catch (e) {
        console.warn(`  ⚠️ Failed to close PR #${pr.number}: ${e}`);
      }

      // Delete the bill branch after close
      try {
        await deleteBranch(owner, repo, pr.head.ref);
        console.log(`  🗑️ Deleted branch ${pr.head.ref}`);
      } catch (e) {
        console.warn(`  ⚠️ Could not delete branch ${pr.head.ref}: ${e}`);
      }

      continue;
    }

    const targetOptionId = optionsByName.get(targetColumn);

    if (!targetOptionId) {
      console.warn(`  ⚠️ No board option for column "${targetColumn}"`);
      continue;
    }

    const existingItem = itemsByPrNumber.get(pr.number);

    if (!existingItem) {
      // Add PR to the project board using its node_id
      try {
        const itemId = await addItemToProject(project.id, pr.node_id);
        await updateItemField(
          project.id,
          itemId,
          stageField.id,
          targetOptionId,
        );
        console.log(
          `  ➕ Added PR #${pr.number} (${billNumber}) → ${targetColumn}`,
        );
        addedCount++;
      } catch (e) {
        console.warn(`  ⚠️ Failed to add PR #${pr.number}: ${e}`);
      }
    } else {
      // Update position if needed
      console.log(`  🔄 PR #${pr.number} (${billNumber}) → ${targetColumn}`);
      try {
        await updateItemField(
          project.id,
          existingItem.id,
          stageField.id,
          targetOptionId,
        );
        movedCount++;
      } catch (e) {
        console.warn(`  ⚠️ Failed to update: ${e}`);
      }
    }
  }

  console.log(
    `\n📊 Board update complete: ${addedCount} added, ${movedCount} moved, ${mergedCount} merged, ${closedCount} closed`,
  );
}

async function refreshAffectedStatutes(
  prTitle: string,
  billNumber: string,
  prNumber: number,
  owner: string,
  repo: string,
): Promise<void> {
  const config = getConfig();
  const lawsRepoPath = resolve(config.LAWS_REPO_PATH);
  const slugs = extractAffectedStatutes(prTitle);

  if (slugs.length === 0) return;

  // Pull latest main (merge created a new commit on remote)
  await pullMain(lawsRepoPath);

  for (const slug of slugs) {
    const actId = await lookupActId(slug);
    if (!actId) {
      console.warn(
        `  ⚠️ No act found in Justice Laws index for slug "${slug}", skipping`,
      );
      continue;
    }

    try {
      const xml = await fetchStatuteXml(actId);
      const { metadata, markdown } = parseStatuteXml(xml, actId);

      const filePath = resolve(lawsRepoPath, "statutes", `${slug}.md`);
      await Bun.write(filePath, markdown);

      const statuteName = metadata.shortTitle || metadata.longTitle;
      const commitMessage = `law: update ${statuteName} (Royal Assent: Bill ${billNumber})\n\nUpdated via Bill ${billNumber} (PR #${prNumber})\nSee: https://github.com/${owner}/${repo}/pull/${prNumber}`;

      await commitFile(
        `statutes/${slug}.md`,
        commitMessage,
        STATUTE_AUTHOR,
        lawsRepoPath,
      );
      await push("main", lawsRepoPath);
      console.log(`  📜 Updated statute: ${statuteName}`);
    } catch (e) {
      console.warn(`  ⚠️ Failed to refresh statute "${slug}": ${e}`);
    }
  }
}
