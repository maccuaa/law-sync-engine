import { z } from "zod/v4";
import { OPENPARLIAMENT_BASE } from "../config.js";

const BillSchema = z.object({
  session: z.string(),
  legisinfo_id: z.number().optional(),
  introduced: z.string().optional(),
  name: z.object({ en: z.string(), fr: z.string().optional() }),
  number: z.string(),
  short_title: z
    .object({ en: z.string(), fr: z.string().optional() })
    .optional(),
  home_chamber: z.string().optional(),
  law: z.boolean().optional(),
  sponsor_politician_url: z.string().optional(),
  text_url: z.string().optional(),
  vote_urls: z.array(z.string()).optional(),
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

async function rateLimitedFetch(url: string): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenParliament API error: ${response.status} for ${url}`);
  }
  return response;
}

function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, OPENPARLIAMENT_BASE);
  url.searchParams.set("format", "json");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function getCurrentSession(): Promise<string> {
  const url = apiUrl("/bills/", { limit: "1", offset: "0" });
  const response = await rateLimitedFetch(url);
  const data = BillsListResponseSchema.parse(await response.json());
  if (data.objects.length === 0) {
    throw new Error("No bills found to detect current session");
  }
  return data.objects[0].session;
}

export async function listBills(session: string): Promise<Bill[]> {
  const bills: Bill[] = [];
  let offset = 0;
  const limit = 20;

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

export async function getBill(
  session: string,
  number: string,
): Promise<Bill> {
  const url = apiUrl(`/bills/${session}/${number}/`);
  const response = await rateLimitedFetch(url);
  const data = BillSchema.parse(await response.json());
  return data;
}

export async function getPolitician(
  politicianUrl: string,
): Promise<Politician> {
  const url = apiUrl(politicianUrl);
  const response = await rateLimitedFetch(url);
  const data = PoliticianSchema.parse(await response.json());
  return data;
}
