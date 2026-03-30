import { JUSTICE_LAWS_BASE } from "../config.js";
import { createXmlParser } from "../parsers/shared.js";

export interface ActEntry {
  actId: string;
  title: string;
  slug: string;
}

let cachedRegistry: Map<string, ActEntry> | null = null;

/**
 * Convert an act title to a slug using the same logic as extractAffectedStatutes:
 * extract text up to and including "Act" or "Code", then slugify.
 */
export function titleToSlug(title: string): string {
  const match = title.match(/^(.+?\s+(?:Act|Code))/i);
  const base = match ? match[1] : title;
  return base
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Fetch the full Justice Laws acts index (Legis.xml) and build a slug→ActEntry map.
 * Cached in memory for the lifetime of the process.
 */
export async function getActsRegistry(): Promise<Map<string, ActEntry>> {
  if (cachedRegistry) return cachedRegistry;

  console.log("📚 Fetching acts registry from Justice Laws...");
  const url = `${JUSTICE_LAWS_BASE}/eng/XML/Legis.xml`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch acts index: ${response.status}`);
  }
  const xml = await response.text();

  const parser = createXmlParser();
  const parsed = parser.parse(xml);

  const registry = new Map<string, ActEntry>();

  const acts = parsed.ActsRegsList?.Acts?.Act;
  if (!Array.isArray(acts)) {
    throw new Error("Unexpected Legis.xml structure: no Acts array");
  }

  for (const act of acts) {
    const lang = act.Language;
    if (lang !== "eng") continue;

    const actId = act.UniqueId || act.OfficialNumber;
    const title = act.Title;
    if (!actId || !title) continue;

    const slug = titleToSlug(title);

    // Skip the generic "an-act" slug (many acts with "An Act to..." titles collide)
    if (slug === "an-act") continue;

    // First entry wins for collisions (e.g., multiple "Budget Implementation Act" versions)
    if (!registry.has(slug)) {
      registry.set(slug, { actId, title, slug });
    }
  }

  console.log(`  📖 Loaded ${registry.size} acts from Justice Laws index`);
  cachedRegistry = registry;
  return registry;
}

/**
 * Look up a Justice Laws act ID by statute slug.
 * Returns null if no matching act is found.
 */
export async function lookupActId(slug: string): Promise<string | null> {
  const registry = await getActsRegistry();
  const entry = registry.get(slug);
  return entry?.actId ?? null;
}

/** Reset the cache (for testing). */
export function clearActsRegistryCache(): void {
  cachedRegistry = null;
}
