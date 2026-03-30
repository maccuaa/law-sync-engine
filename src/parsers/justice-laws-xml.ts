import {
  createOrderPreservingParser,
  createXmlParser,
  extractText,
  findOrderedElement,
  generateFrontmatter,
  renderOrderedBody,
} from "./shared.js";

export interface StatuteMetadata {
  longTitle: string;
  shortTitle: string;
  actId: string;
  lastAmended: string;
}

export function parseStatuteXml(
  xml: string,
  actId: string,
): { metadata: StatuteMetadata; markdown: string } {
  const parser = createXmlParser();
  const parsed = parser.parse(xml);
  const statute = parsed.Statute;

  const ident = statute.Identification;
  const longTitle = extractText(ident.LongTitle);
  const shortTitle = extractText(ident.ShortTitle);
  const lastAmended =
    (statute["@_lims:lastAmendedDate"] as string) ||
    (statute["@_lims:pit-date"] as string) ||
    "";

  const metadata: StatuteMetadata = {
    longTitle,
    shortTitle,
    actId,
    lastAmended,
  };

  const frontmatter = generateFrontmatter({
    title: shortTitle || longTitle,
    long_title: longTitle,
    short_title: shortTitle,
    act_id: actId,
    source: `https://laws-lois.justice.gc.ca/eng/acts/${actId.toLowerCase()}/`,
    last_amended: lastAmended,
  });

  // Use order-preserving parser for body
  const orderParser = createOrderPreservingParser();
  const orderedParsed = orderParser.parse(xml);
  const bodyOrdered = findOrderedElement(orderedParsed, "Statute", "Body");

  const lines: string[] = [frontmatter, "", `# ${shortTitle || longTitle}`, ""];

  if (bodyOrdered) {
    lines.push(renderOrderedBody(bodyOrdered));
  }

  return { metadata, markdown: `${lines.join("\n").trim()}\n` };
}
