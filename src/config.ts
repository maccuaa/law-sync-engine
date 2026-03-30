import { z } from "zod/v4";

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  LAWS_REPO: z.string().min(1),
  LAWS_REPO_PATH: z.string().default("../canadian-laws"),
  PROJECT_NUMBER: z.coerce.number().default(1),
  SESSION: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}

export const OPENPARLIAMENT_BASE = "https://api.openparliament.ca";
export const JUSTICE_LAWS_BASE = "https://laws-lois.justice.gc.ca";
export const PARL_CA_BASE = "https://www.parl.ca";

export const PROJECT_BOARD_COLUMNS = [
  "Notice Paper",
  "First Reading",
  "Second Reading",
  "Committee",
  "Report Stage",
  "Third Reading",
  "Senate",
  "Royal Assent",
  "Defeated",
] as const;

export type BoardColumn = (typeof PROJECT_BOARD_COLUMNS)[number];
