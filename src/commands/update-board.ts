import type { Bill } from "../api/openparliament.js";
import {
  getBill,
  getCurrentSession,
  listBills,
} from "../api/openparliament.js";
import type { BoardColumn } from "../config.js";
import { getConfig } from "../config.js";
import {
  addItemToProject,
  getProjectId,
  getProjectItems,
  updateItemField,
} from "../github/graphql.js";
import { listOpenPullRequests } from "../github/rest.js";

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

  // 2. Find the "Stage" / "Status" field
  const stageField = project.fields.find(
    (f) => f.name === "Stage" || f.name === "Status",
  );
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
    `\n📊 Board update complete: ${addedCount} added, ${movedCount} moved`,
  );
}
