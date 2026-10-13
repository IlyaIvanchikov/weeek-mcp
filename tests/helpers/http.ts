import { vi } from "vitest";
import { HttpClient, type HttpConfig } from "../../src/http.js";

const token = "t".repeat(24);

export const httpConfig: HttpConfig = { token, baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000 };
export const bearer = `Bearer ${token}`;

export function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
export function binaryFetch(status: number, bytes: Uint8Array, contentType: string) {
  return vi.fn(async () => new Response(bytes as unknown as BodyInit, { status, headers: { "content-type": contentType } }));
}
export function httpWith(f: ReturnType<typeof vi.fn>) {
  return new HttpClient(httpConfig, f as unknown as typeof fetch);
}
export function sent(f: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = f.mock.calls[call] as [URL, RequestInit];
  return { url: String(url), init, json: () => JSON.parse(init.body as string) };
}
