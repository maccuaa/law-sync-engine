import {
  createXmlParser,
  createOrderPreservingParser,
  extractText,
  ensureArray,
  generateFrontmatter,
  findOrderedElement,
  renderOrderedBody,
} from "./shared.js";

export interface BillMetadata {
  billNumber: string;
  session: string;
  longTitle: string;
  shortTitle: string;
  stage: string;
  introducedDate: string;
}

export function parseBillXml(xml: string): {
  metadata: BillMetadata;
  markdown: string;
} {
  const parser = createXmlParser();
  const parsed = parser.parse(xml);
  const bill = parsed.Bill;

  const ident = bill.Identification;
  const billNumber = extractText(ident.BillNumber);
  const session = `${extractText(ident.Parliament?.Number)}-${extractText(ident.Parliament?.Session)}`;
  const longTitle = extractText(ident.LongTitle);
  const shortTitle = extractText(ident.ShortTitle);

  // Extract stage from BillHistory
  const stages = ensureArray(ident.BillHistory?.Stages);
  const lastStage = stages[stages.length - 1] as
    | Record<string, unknown>
    | undefined;
  const stage = (lastStage?.["@_stage"] as string) || "unknown";

  // Extract date from last stage
  const date = lastStage?.Date as Record<string, unknown> | undefined;
  const introducedDate = date
    ? `${extractText(date.YYYY)}-${String(extractText(date.MM)).padStart(2, "0")}-${String(extractText(date.DD)).padStart(2, "0")}`
    : "";

  const metadata: BillMetadata = {
    billNumber,
    session,
    longTitle,
    shortTitle,
    stage,
    introducedDate,
  };

  const frontmatter = generateFrontmatter({
    bill_number: billNumber,
    title: shortTitle || longTitle,
    long_title: longTitle,
    session,
    stage,
    introduced: introducedDate,
  });

  const lines: string[] = [
    frontmatter,
    "",
    `# Bill ${billNumber} — ${shortTitle || longTitle}`,
    "",
  ];

  // Render summary if present
  const intro = bill.Introduction;
  if (intro?.Summary) {
    lines.push("## Summary");
    lines.push("");
    const provisions = ensureArray(intro.Summary.Provision);
    for (const p of provisions) {
      const pObj = p as Record<string, unknown>;
      const label = extractText(pObj.Label);
      const text = extractText(pObj.Text);
      if (label) {
        lines.push(`${label} ${text}`);
      } else {
        lines.push(text);
      }
    }
    lines.push("");
  }

  // Render body using order-preserving parser
  const orderParser = createOrderPreservingParser();
  const orderedParsed = orderParser.parse(xml);
  const bodyOrdered = findOrderedElement(orderedParsed, "Bill", "Body");

  if (bodyOrdered) {
    lines.push(renderOrderedBody(bodyOrdered));
  }

  return { metadata, markdown: `${lines.join("\n").trim()}\n` };
}
