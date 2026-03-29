import { getCurrentSession, listBills } from "../api/openparliament.js";
import type { Bill } from "../api/openparliament.js";
import { getConfig, PROJECT_BOARD_COLUMNS } from "../config.js";
import type { BoardColumn } from "../config.js";
import {
  addItemToProject,
  getProjectFields,
  getProjectId,
  getProjectItems,
  updateItemField,
} from "../github/graphql.js";
import { listOpenPullRequests } from "../github/rest.js";

const STATUS_MAP: Record<string, BoardColumn> = {
  introduced: "First Reading",
  "first reading": "First Reading",
  "passed first reading": "First Reading",
  "second reading": "Second Reading",
  "passed second reading": "Second Reading",
  "in committee": "Committee",
  committee: "Committee",
  "reported with amendments": "Report Stage",
  "report stage": "Report Stage",
  "third reading": "Third Reading",
  "passed third reading": "Third Reading",
  "passed house": "Senate",
  "in senate": "Senate",
  senate: "Senate",
  "passed senate": "Senate",
  "royal assent": "Royal Assent",
  defeated: "Defeated",
  withdrawn: "Defeated",
  "died on the order paper": "Defeated",
};

export function mapStatusToColumn(bill: Bill): BoardColumn {
  if (bill.law) return "Royal Assent";
  return "First Reading";
}

export function mapStatusStringToColumn(status: string): BoardColumn {
  const normalized = status.toLowerCase().trim();
  for (const [pattern, column] of Object.entries(STATUS_MAP)) {
    if (normalized.includes(pattern)) return column;
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
  if (!stageField || !stageField.options) {
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

  const optionsByName = new Map(
    stageField.options.map((o) => [o.name, o.id]),
  );

  // 3. Get existing project items
  const existingItems = await getProjectItems(project.id);
  const itemsByPrNumber = new Map(
    existingItems
      .filter((item) => item.content?.number)
      .map((item) => [item.content!.number, item]),
  );

  // 4. Get open PRs (Octokit returns node_id)
  const openPrs = await listOpenPullRequests(owner, repo);
  console.log(`  📝 Found ${openPrs.length} open PRs`);

  // 5. Get current session bills
  const session = await getCurrentSession();
  const bills = await listBills(session);
  const billsByNumber = new Map(bills.map((b) => [b.number, b]));

  // 6. Reconcile PRs with the board
  let addedCount = 0;
  let movedCount = 0;

  for (const pr of openPrs) {
    const billMatch = pr.title.match(/Bill\s+(C-\d+|S-\d+)/i);
    if (!billMatch) continue;

    const billNumber = billMatch[1].toUpperCase();
    const bill = billsByNumber.get(billNumber);

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
      console.log(
        `  🔄 PR #${pr.number} (${billNumber}) → ${targetColumn}`,
      );
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
