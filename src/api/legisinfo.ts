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

export async function getBillXmlUrl(
  session: string,
  billNumber: string,
  stage?: string,
): Promise<string | null> {
  const stagesToTry = stage ? [stage] : ([...STAGES] as string[]);

  for (const s of stagesToTry) {
    const url = `${PARL_CA_BASE}/DocumentViewer/en/${session}/bill/${billNumber}/${s}`;
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) continue;
      const html = await response.text();
      const match = html.match(/href="(\/Content\/Bills\/[^"]+\.xml)"/);
      if (match) {
        return `${PARL_CA_BASE}${match[1]}`;
      }
    } catch {}
  }
  return null;
}

export async function fetchBillXml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bill XML: ${response.status}`);
  }
  return response.text();
}
