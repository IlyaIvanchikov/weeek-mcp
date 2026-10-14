import { vi, type Mock } from "vitest";
import { HttpClient, type HttpConfig } from "../../src/http.js";

const token = "t".repeat(24);

export const httpConfig: HttpConfig = { token, baseUrl: "https://api.weeek.net/public/v1", timeoutMs: 1000 };
export const bearer = `Bearer ${token}`;

/** fetch's shape, so a stub's recorded calls are typed `[url, init]` instead of an empty tuple. */
export type FetchStub = (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export function jsonFetch(status: number, body: unknown): Mock<FetchStub> {
  return vi.fn<FetchStub>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
export function binaryFetch(status: number, bytes: Uint8Array, contentType: string): Mock<FetchStub> {
  return vi.fn<FetchStub>(async () => new Response(bytes as unknown as BodyInit, { status, headers: { "content-type": contentType } }));
}
export function httpWith(f: Mock<FetchStub>) {
  return new HttpClient(httpConfig, f as unknown as typeof fetch);
}
export function sent(f: Mock<FetchStub>, call = 0) {
  const [url, init = {}] = f.mock.calls[call];
  return { url: String(url), init, json: () => JSON.parse(init.body as string) };
}
