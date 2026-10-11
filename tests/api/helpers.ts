import { vi } from "vitest";
import { HttpClient } from "../../src/http.js";

export const cfg = { token: "t".repeat(24), baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000, attachMaxBytes: 1024 };
export const bearer = "Bearer " + "t".repeat(24);

export function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
export function binaryFetch(status: number, bytes: Uint8Array, contentType: string) {
  return vi.fn(async () => new Response(bytes as unknown as BodyInit, { status, headers: { "content-type": contentType } }));
}
export function httpWith(f: ReturnType<typeof vi.fn>) {
  return new HttpClient(cfg, f as unknown as typeof fetch);
}
export function sent(f: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = f.mock.calls[call] as [URL, RequestInit];
  return { url: String(url), init, json: () => JSON.parse(init.body as string) };
}
