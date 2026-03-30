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
  const safeFilename = filename.replace(/[^a-z0-9-]/g, "");
  if (!SAFE_SLUG_REGEX.test(safeFilename) || safeFilename.length === 0) {
    throw new Error(`Invalid filename slug: "${filename}"`);
  }
  return `${directory}/${safeFilename}.md`;
}
