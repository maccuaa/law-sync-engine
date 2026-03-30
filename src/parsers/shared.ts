import { XMLParser } from "fast-xml-parser";

// Standard parser: groups elements by tag name (fast lookup, loses document order)
export function createXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) =>
      [
        "Section",
        "Subsection",
        "Paragraph",
        "Subparagraph",
        "Provision",
        "Heading",
        "Definition",
        "Stages",
      ].includes(name),
  });
}

// Order-preserving parser: returns arrays of { tagName: children } preserving document order
export function createOrderPreservingParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    preserveOrder: true,
  });
}

type OrderedNode = Record<string, unknown> & { ":@"?: Record<string, string> };

/**
 * Extract text content from a node that might be a string, number,
 * or object with #text and inline child elements.
 */
export function extractText(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const parts: string[] = [];

    if (obj["#text"] !== undefined) {
      const textParts = Array.isArray(obj["#text"])
        ? obj["#text"]
        : [obj["#text"]];
      parts.push(...textParts.map(String));
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === "#text" || key.startsWith("@_")) continue;
      if (key === "XRefExternal") {
        parts.push(extractText(value));
      } else if (key === "DefinedTermEn") {
        parts.push(`**${extractText(value)}**`);
      } else if (key === "Keep" || key === "AmendedText") {
        parts.push(extractText(value));
      }
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return String(node);
}

export function renderMarginalNote(node: unknown): string {
  if (!node) return "";
  const text = extractText(node);
  if (!text) return "";
  return `*${text}*`;
}

export function renderSection(section: Record<string, unknown>): string {
  const lines: string[] = [];
  const label = extractText(section.Label);
  const marginalNote = renderMarginalNote(section.MarginalNote);

  if (label) {
    lines.push(`### Section ${label}`);
  }
  if (marginalNote) {
    lines.push(marginalNote);
  }
  lines.push("");

  const text = extractText(section.Text);
  if (text) {
    lines.push(text);
    lines.push("");
  }

  for (const sub of ensureArray(section.Subsection)) {
    lines.push(renderSubsection(sub));
  }

  for (const def of ensureArray(section.Definition)) {
    lines.push(renderDefinition(def));
  }

  return lines.join("\n");
}

export function renderSubsection(sub: Record<string, unknown>): string {
  const lines: string[] = [];
  const label = extractText(sub.Label);
  const text = extractText(sub.Text);
  const marginalNote = renderMarginalNote(sub.MarginalNote);

  if (marginalNote) {
    lines.push(marginalNote);
    lines.push("");
  }

  if (label && text) {
    lines.push(`**${label}** ${text}`);
  } else if (text) {
    lines.push(text);
  }
  lines.push("");

  for (const para of ensureArray(sub.Paragraph)) {
    lines.push(renderParagraph(para));
  }

  return lines.join("\n");
}

export function renderParagraph(para: Record<string, unknown>): string {
  const label = extractText(para.Label);
  const text = extractText(para.Text);
  const lines: string[] = [];

  if (label && text) {
    lines.push(`  - ${label} ${text}`);
  } else if (text) {
    lines.push(`  - ${text}`);
  }

  for (const sub of ensureArray(para.Subparagraph)) {
    const subLabel = extractText(sub.Label);
    const subText = extractText(sub.Text);
    if (subLabel && subText) {
      lines.push(`    - ${subLabel} ${subText}`);
    } else if (subText) {
      lines.push(`    - ${subText}`);
    }
  }

  if (lines.length > 0) {
    return `${lines.join("\n")}\n`;
  }
  return "";
}

export function renderDefinition(def: Record<string, unknown>): string {
  const lines: string[] = [];
  const term = extractText(def.DefinedTermEn);
  const text = extractText(def.Text);

  if (term) {
    lines.push(`> **${term}**`);
  }
  if (text) {
    lines.push(`> ${text}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderHeading(heading: Record<string, unknown>): string {
  const lines: string[] = [];
  const level = heading["@_level"] ? Number(heading["@_level"]) : 1;
  const label = extractText(heading.Label);
  const titleText = extractText(heading.TitleText);

  const prefix = "#".repeat(Math.min(level + 1, 4));

  if (label && titleText) {
    lines.push(`${prefix} ${label} — ${titleText}`);
  } else if (titleText) {
    lines.push(`${prefix} ${titleText}`);
  } else if (label) {
    lines.push(`${prefix} ${label}`);
  }
  lines.push("");
  return lines.join("\n");
}

// --- Order-preserving helpers ---

/**
 * Extract text content from the preserveOrder format.
 * In this format, mixed content is an array of { "#text": "..." } and { TagName: [...] } nodes.
 */
export function extractOrderedText(nodes: OrderedNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if ("#text" in node) {
      parts.push(String(node["#text"]));
    } else if ("DefinedTermEn" in node) {
      parts.push(
        `**${extractOrderedText(node.DefinedTermEn as OrderedNode[])}**`,
      );
    } else if ("XRefExternal" in node) {
      parts.push(extractOrderedText(node.XRefExternal as OrderedNode[]));
    } else if ("Keep" in node) {
      parts.push(extractOrderedText(node.Keep as OrderedNode[]));
    } else if ("AmendedText" in node) {
      parts.push(extractOrderedText(node.AmendedText as OrderedNode[]));
    } else if ("DefinedTermFr" in node) {
      // Skip French terms
    } else if ("HistoricalNote" in node) {
      // Skip historical notes in marginal notes
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Get the first child text for a given tag in preserveOrder children array. */
function getOrderedChildText(children: OrderedNode[], tagName: string): string {
  for (const child of children) {
    if (tagName in child) {
      return extractOrderedText(child[tagName] as OrderedNode[]);
    }
  }
  return "";
}

/** Get all children matching a tag name from preserveOrder array. */
function getOrderedChildren(
  children: OrderedNode[],
  tagName: string,
): OrderedNode[] {
  return children.filter((c) => tagName in c);
}

function renderOrderedMarginalNote(children: OrderedNode[]): string {
  const text = extractOrderedText(children);
  if (!text) return "";
  return `*${text}*`;
}

function renderOrderedSubparagraph(node: OrderedNode): string {
  const children = node.Subparagraph as OrderedNode[];
  const label = getOrderedChildText(children, "Label");
  const text = getOrderedChildText(children, "Text");
  if (label && text) return `    - ${label} ${text}`;
  if (text) return `    - ${text}`;
  return "";
}

function renderOrderedParagraph(node: OrderedNode): string {
  const children = node.Paragraph as OrderedNode[];
  const label = getOrderedChildText(children, "Label");
  const text = getOrderedChildText(children, "Text");
  const lines: string[] = [];

  if (label && text) {
    lines.push(`  - ${label} ${text}`);
  } else if (text) {
    lines.push(`  - ${text}`);
  }

  for (const sub of getOrderedChildren(children, "Subparagraph")) {
    const rendered = renderOrderedSubparagraph(sub);
    if (rendered) lines.push(rendered);
  }

  if (lines.length > 0) return `${lines.join("\n")}\n`;
  return "";
}

function renderOrderedDefinition(node: OrderedNode): string {
  const children = node.Definition as OrderedNode[];
  const lines: string[] = [];
  const term = getOrderedChildText(children, "DefinedTermEn");
  const text = getOrderedChildText(children, "Text");

  if (term) lines.push(`> **${term}**`);
  if (text) lines.push(`> ${text}`);
  lines.push("");
  return lines.join("\n");
}

function renderOrderedSubsection(node: OrderedNode): string {
  const children = node.Subsection as OrderedNode[];
  const lines: string[] = [];
  const label = getOrderedChildText(children, "Label");
  const text = getOrderedChildText(children, "Text");

  const mnNodes = getOrderedChildren(children, "MarginalNote");
  if (mnNodes.length > 0) {
    const mn = renderOrderedMarginalNote(
      mnNodes[0].MarginalNote as OrderedNode[],
    );
    if (mn) {
      lines.push(mn);
      lines.push("");
    }
  }

  if (label && text) {
    lines.push(`**${label}** ${text}`);
  } else if (text) {
    lines.push(text);
  }
  lines.push("");

  for (const para of getOrderedChildren(children, "Paragraph")) {
    lines.push(renderOrderedParagraph(para));
  }

  for (const def of getOrderedChildren(children, "Definition")) {
    lines.push(renderOrderedDefinition(def));
  }

  return lines.join("\n");
}

function renderOrderedSection(node: OrderedNode): string {
  const children = node.Section as OrderedNode[];
  const lines: string[] = [];
  const label = getOrderedChildText(children, "Label");

  const mnNodes = getOrderedChildren(children, "MarginalNote");
  const marginalNote =
    mnNodes.length > 0
      ? renderOrderedMarginalNote(mnNodes[0].MarginalNote as OrderedNode[])
      : "";

  if (label) lines.push(`### Section ${label}`);
  if (marginalNote) lines.push(marginalNote);
  lines.push("");

  const text = getOrderedChildText(children, "Text");
  if (text) {
    lines.push(text);
    lines.push("");
  }

  for (const sub of getOrderedChildren(children, "Subsection")) {
    lines.push(renderOrderedSubsection(sub));
  }

  for (const def of getOrderedChildren(children, "Definition")) {
    lines.push(renderOrderedDefinition(def));
  }

  return lines.join("\n");
}

function renderOrderedHeading(node: OrderedNode): string {
  const children = node.Heading as OrderedNode[];
  const attrs = node[":@"] as Record<string, string> | undefined;
  const level = attrs?.["@_level"] ? Number(attrs["@_level"]) : 1;
  const label = getOrderedChildText(children, "Label");
  const titleText = getOrderedChildText(children, "TitleText");

  const prefix = "#".repeat(Math.min(level + 1, 4));
  const lines: string[] = [];

  if (label && titleText) {
    lines.push(`${prefix} ${label} — ${titleText}`);
  } else if (titleText) {
    lines.push(`${prefix} ${titleText}`);
  } else if (label) {
    lines.push(`${prefix} ${label}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Navigate the preserveOrder tree to find a nested element.
 * Returns the children array of the target element.
 */
export function findOrderedElement(
  root: OrderedNode[],
  ...path: string[]
): OrderedNode[] | null {
  let current: OrderedNode[] = root;
  for (const tag of path) {
    let found = false;
    for (const node of current) {
      if (tag in node) {
        current = node[tag] as OrderedNode[];
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return current;
}

/**
 * Render the Body element from preserveOrder format, preserving document order
 * of interleaved Heading and Section elements.
 */
export function renderOrderedBody(bodyChildren: OrderedNode[]): string {
  const lines: string[] = [];

  for (const node of bodyChildren) {
    if ("Heading" in node) {
      lines.push(renderOrderedHeading(node));
    } else if ("Section" in node) {
      lines.push(renderOrderedSection(node));
    }
  }

  return lines.join("\n");
}

// --- Utility helpers ---

export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function generateFrontmatter(
  data: Record<string, string | undefined>,
): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
