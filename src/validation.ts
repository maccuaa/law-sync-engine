const BILL_NUMBER_REGEX = /^[CS]-\d+[A-Z]?$/i;
const SAFE_SLUG_REGEX = /^[a-z0-9-]+$/;

export function validateBillNumber(number: string): string {
  const trimmed = number.trim();
  if (!BILL_NUMBER_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid bill number format: "${trimmed}". Expected pattern like C-11 or S-4.`,
    );
  }
  return trimmed;
}

export function sanitizeForGit(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control chars for security
  const stripped = value.replace(/[\x00-\x1f\x7f]/g, "");
  return stripped.replace(/"/g, '\\"').trim();
}

export function sanitizeGitAuthor(name: string, email: string): string {
  const safeName = sanitizeForGit(name);
  const safeEmail = email.replace(/[^a-zA-Z0-9@._+-]/g, "");
  return `${safeName} <${safeEmail}>`;
}

export function safeBranchName(billNumber: string): string {
  const validated = validateBillNumber(billNumber);
  return `bill/${validated}`;
}

export function safeFilePath(directory: string, filename: string): string {
  const segments = directory.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg === "") {
      throw new Error(
        `Invalid directory path: "${directory}". Must not contain ".." or empty segments.`,
      );
    }
  }

  const safeFilename = filename.replace(/[^a-z0-9-]/g, "");
  if (!SAFE_SLUG_REGEX.test(safeFilename) || safeFilename.length === 0) {
    throw new Error(`Invalid filename slug: "${filename}"`);
  }
  return `${directory}/${safeFilename}.md`;
}

export function extractAffectedStatutes(title: string): string[] {
  const slugs: string[] = [];
  // Match "amend the X Act" or "amend the X Code" patterns
  const amendMatch = title.match(/amend the (.+)/i);
  if (!amendMatch) return slugs;

  // Split on ", the" and " and the" to handle multiple acts
  const actsPart = amendMatch[1];
  const actNames = actsPart.split(/(?:,\s*the\s+|\s+and the\s+)/i);

  for (const name of actNames) {
    // Extract just the act/code name (stop at common suffixes)
    const cleanMatch = name.match(/^(.+?\s+(?:Act|Code))/i);
    if (cleanMatch) {
      const slug = cleanMatch[1]
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      if (slug) slugs.push(slug);
    }
  }

  return slugs;
}
