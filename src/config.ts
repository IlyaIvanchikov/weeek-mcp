import { z } from "zod";

const schema = z.object({
  // Optional at boot so the server can start and list its tools without credentials
  // (registries introspect it this way); a token is required only to call a tool.
  // When provided it must still look real, so the length check stays.
  WEEEK_API_TOKEN: z.string().min(20, "WEEEK_API_TOKEN must be at least 20 chars").optional(),
  WEEEK_API_BASE_URL: z.string().url().default("https://api.weeek.net/public/v1"),
  WEEEK_TIMEOUT_MS: z.coerce.number().int().positive().max(600000).default(30000),
  // Attaching files is opt-in and jailed to this directory (see src/attach.ts).
  // Unset => weeek_attach_file is disabled.
  WEEEK_ATTACH_DIR: z.string().min(1).optional(),
  WEEEK_ATTACH_MAX_BYTES: z.coerce.number().int().positive().max(1_073_741_824).default(10_485_760),
});

export interface Config {
  token?: string;
  baseUrl: string;
  timeoutMs: number;
  attachDir?: string;
  attachMaxBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid config: ${msg}`);
  }
  return {
    token: parsed.data.WEEEK_API_TOKEN,
    baseUrl: parsed.data.WEEEK_API_BASE_URL,
    timeoutMs: parsed.data.WEEEK_TIMEOUT_MS,
    attachDir: parsed.data.WEEEK_ATTACH_DIR,
    attachMaxBytes: parsed.data.WEEEK_ATTACH_MAX_BYTES,
  };
}
