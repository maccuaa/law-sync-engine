import { PARL_CA_BASE } from "../config.js";

const STAGES = [
  "first-reading",
  "second-reading",
  "committee",
  "report-stage",
  "third-reading",
  "royal-assent",
] as const;

export type BillStage = (typeof STAGES)[number];

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 429) {
        const backoff = 2000 * attempt;
        console.warn(
          `  ⏳ LEGISinfo rate limited, retrying in ${backoff / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      return response;
    } catch (_e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return null;
}

export async function getBillXmlUrl(
  session: string,
  billNumber: string,
  stage?: string,
): Promise<string | null> {
  const stagesToTry = stage ? [stage] : ([...STAGES] as string[]);

  for (const s of stagesToTry) {
    const url = `${PARL_CA_BASE}/DocumentViewer/en/${session}/bill/${billNumber}/${s}`;
    const response = await fetchWithRetry(url);
    if (!response?.ok) continue;

    const html = await response.text();
    const match = html.match(/href="(\/Content\/Bills\/[^"]+\.xml)"/);
    if (match) {
      console.log(`  📄 Found XML at ${s} stage`);
      return `${PARL_CA_BASE}${match[1]}`;
    }
  }
  return null;
}

export async function fetchBillXml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Failed to fetch bill XML: ${response.status}`);
  }
  return response.text();
}
