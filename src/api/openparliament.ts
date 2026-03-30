import { z } from "zod/v4";
import { OPENPARLIAMENT_BASE } from "../config.js";

const BillSchema = z.object({
  session: z.string(),
  legisinfo_id: z.number().nullable().optional(),
  introduced: z.string().nullable().optional(),
  name: z.object({ en: z.string(), fr: z.string().nullable().optional() }),
  number: z.string(),
  short_title: z
    .object({ en: z.string(), fr: z.string().nullable().optional() })
    .nullable()
    .optional(),
  home_chamber: z.string().nullable().optional(),
  law: z.boolean().nullable().optional(),
  status_code: z.string().nullable().optional(),
  sponsor_politician_url: z.string().nullable().optional(),
  text_url: z.string().nullable().optional(),
  vote_urls: z.array(z.string()).nullable().optional(),
  url: z.string(),
});

export type Bill = z.infer<typeof BillSchema>;

export { BillSchema };

const PoliticianSchema = z.object({
  name: z.string(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
});

export type Politician = z.infer<typeof PoliticianSchema>;

export { PoliticianSchema };

const politicianCache = new Map<string, Politician>();

const PaginationSchema = z.object({
  offset: z.number(),
  limit: z.number(),
  next_url: z.string().nullable().optional(),
  previous_url: z.string().nullable().optional(),
});

const BillsListResponseSchema = z.object({
  pagination: PaginationSchema,
  objects: z.array(BillSchema),
});

const RATE_LIMIT_MS = 300;
const MAX_RETRIES = 3;
const USER_AGENT =
  "law-sync-engine/0.1.0 (https://github.com/maccuaa/law-sync-engine)";

const API_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "API-Version": "v1",
  "User-Agent": USER_AGENT,
};

async function rateLimitedFetch(url: string): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers: API_HEADERS });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 5;
      const backoff = retryAfter * 1000 * attempt;
      console.warn(
        `  ⏳ Rate limited (429), retrying in ${backoff / 1000}s (attempt ${attempt}/${MAX_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `OpenParliament API error: ${response.status} for ${url}`,
      );
    }
    return response;
  }

  throw new Error(`OpenParliament API: max retries exceeded for ${url}`);
}

function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, OPENPARLIAMENT_BASE);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function getCurrentSession(): Promise<string> {
  // Fetch recent bills (last 2 years) and return the highest session number.
  // Session format is "{parliament}-{session}" e.g. "45-1", so lexicographic
  // comparison of the numeric parts gives the latest.
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const dateStr = twoYearsAgo.toISOString().split("T")[0];

  const url = apiUrl("/bills/", {
    introduced__gte: dateStr,
    limit: "500",
  });
  const response = await rateLimitedFetch(url);
  const data = BillsListResponseSchema.parse(await response.json());

  if (data.objects.length === 0) {
    throw new Error(
      "No bills found in the last 2 years to detect current session",
    );
  }

  // Parse session strings and return the highest parliament/session
  let bestSession = data.objects[0].session;
  let bestParlNum = 0;
  let bestSessNum = 0;

  const seen = new Set<string>();
  for (const bill of data.objects) {
    if (seen.has(bill.session)) continue;
    seen.add(bill.session);

    const parts = bill.session.split("-");
    const parlNum = Number.parseInt(parts[0], 10);
    const sessNum = Number.parseInt(parts[1], 10);

    if (
      parlNum > bestParlNum ||
      (parlNum === bestParlNum && sessNum > bestSessNum)
    ) {
      bestParlNum = parlNum;
      bestSessNum = sessNum;
      bestSession = bill.session;
    }
  }

  return bestSession;
}

export async function listBills(session: string): Promise<Bill[]> {
  const bills: Bill[] = [];
  let offset = 0;
  const limit = 500; // API max is 500 per page

  while (true) {
    const url = apiUrl("/bills/", {
      session,
      limit: String(limit),
      offset: String(offset),
    });
    const response = await rateLimitedFetch(url);
    const data = BillsListResponseSchema.parse(await response.json());
    bills.push(...data.objects);

    if (!data.pagination.next_url || data.objects.length < limit) {
      break;
    }
    offset += limit;
  }

  return bills;
}

export async function getBill(session: string, number: string): Promise<Bill> {
  const url = apiUrl(`/bills/${session}/${number}/`);
  const response = await rateLimitedFetch(url);
  const data = BillSchema.parse(await response.json());
  return data;
}

export async function getPolitician(
  politicianUrl: string,
): Promise<Politician> {
  const cached = politicianCache.get(politicianUrl);
  if (cached) return cached;

  const url = apiUrl(politicianUrl);
  const response = await rateLimitedFetch(url);
  const data = PoliticianSchema.parse(await response.json());
  politicianCache.set(politicianUrl, data);
  return data;
}

export function clearPoliticianCache(): void {
  politicianCache.clear();
}
