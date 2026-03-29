import { JUSTICE_LAWS_BASE } from "../config.js";

export async function fetchStatuteXml(actId: string): Promise<string> {
  const url = `${JUSTICE_LAWS_BASE}/eng/XML/${actId}.xml`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch statute XML for ${actId}: ${response.status}`,
    );
  }
  return response.text();
}
