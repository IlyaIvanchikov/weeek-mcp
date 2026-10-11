#!/usr/bin/env node
// Re-extract WEEEK's public OpenAPI spec into spec/weeek-openapi.json.
//
// WHY THIS EXISTS: developers.weeek.net is a client-rendered docs site. Every HTML path
// returns the same shell, so the spec cannot be fetched as a file. It IS shipped to the
// browser, though — as a JavaScript chunk the docs app lazy-loads. This script follows the
// same chain the browser does:
//   1. GET /                       → find the entry script  /assets/entry.client-<hash>.js
//   2. GET that script             → find the spec chunk    weeek.yaml-<hash>.js
//   3. import() the spec chunk     → it `export`s the resolved `schema` object
//   4. write it back as plain JSON, turning shared schema objects into $ref links
//
// TRUST: step 3 imports and executes JavaScript served by developers.weeek.net. That is the
// only way the docs site exposes the spec, and it runs only on the developer's machine that
// runs this script — never in CI and never in the shipped server.
//
// Needs:   Node >= 18 (for fetch); curl only when REFRESH_SPEC_INTERFACE is set.
// Usage:   npm run refresh-spec
// Success: wrote …/spec/weeek-openapi.json: openapi 3.1.1, 99 paths, 157 operations, 35 schemas (from weeek.yaml-<hash>.js)
// Then:    npx vitest run tests/contract.test.ts   — fails for every new or removed operation
//
// WHEN IT FAILS
//   "fetch failed" / ENOTFOUND  → DNS. A VPN resolver may black-hole the weeek.net zone. Route
//                                 the zone through your non-VPN link instead:
//                                   resolvectl domain <interface> '~weeek.net' && resolvectl flush-caches
//                                 Find <interface> with `ip route get 1.1.1.1` (the `dev` field)
//                                 and check its DNS link with `resolvectl status`. Re-run after
//                                 every network reconnect, which resets the setting.
//   connect timeout on the docs host → a VPN tunnel blocks it. Run with
//                                   REFRESH_SPEC_INTERFACE=<interface> npm run refresh-spec
//                                 (same `ip route get 1.1.1.1` to find it). This binds the request
//                                 to that interface via curl's --interface; Node's fetch has no
//                                 equivalent, so the script shells out to curl then.
//   "entry script not found" / "spec chunk not found" → the docs app changed its layout.
//                                 Open developers.weeek.net in a browser, Network tab, find the
//                                 chunk whose name contains "weeek.yaml", and update the regexes.
//                                 This needs a human: the new layout cannot be guessed.
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DOCS = "https://developers.weeek.net";
const OUT = new URL("../spec/weeek-openapi.json", import.meta.url);
const iface = process.env.REFRESH_SPEC_INTERFACE;

async function fetchText(url) {
  if (!iface) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.text();
  }
  // --fail makes an HTTP error an error; without it curl returns the error page as the body
  // and the script reports a misleading "entry script not found".
  const { stdout } = await promisify(execFile)("curl", ["-sS", "--fail", "--interface", iface, "--max-time", "60", url], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

const landing = await fetchText(`${DOCS}/`);
const entry = landing.match(/src="(\/assets\/entry\.client-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error("entry script not found in the landing page");

const entryJs = await fetchText(`${DOCS}${entry}`);
const chunk = entryJs.match(/weeek\.yaml-[A-Za-z0-9_-]+\.js/)?.[0];
if (!chunk) throw new Error("spec chunk not found in the entry script");

const chunkJs = await fetchText(`${DOCS}/assets/${chunk}`);
const tmp = join(tmpdir(), `weeek-spec-${Date.now()}.mjs`);
let schema;
try {
  await writeFile(tmp, chunkJs);
  ({ schema } = await import(pathToFileURL(tmp).href));
} finally {
  await rm(tmp, { force: true });
}

// The chunk resolves every $ref into a shared object graph (recursive where the spec is).
// Walk it back to JSON: a schema object is written in full once, under components.schemas,
// and as a $ref everywhere else. The chunk tags each one with a non-enumerable `__$ref`.
const definitions = schema.components?.schemas ?? {};
const definitionSite = new Map(Object.entries(definitions).map(([name, obj]) => [obj, `#/components/schemas/${name}`]));
function toPlain(node, atDefinition = false) {
  if (Array.isArray(node)) return node.map((n) => toPlain(n));
  if (!node || typeof node !== "object") return node;
  const ref = definitionSite.get(node) ?? node.__$ref;
  if (ref && !atDefinition) return { $ref: ref };
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, toPlain(v)]));
}

const document = {
  openapi: schema.openapi,
  info: schema.info,
  servers: schema.servers,
  tags: schema.tags,
  paths: toPlain(schema.paths),
  components: {
    schemas: Object.fromEntries(Object.entries(definitions).map(([n, o]) => [n, toPlain(o, true)])),
    securitySchemes: schema.components?.securitySchemes,
  },
};

await mkdir(new URL("../spec/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(document, null, 2) + "\n");
const operations = Object.values(document.paths).reduce(
  (n, item) => n + Object.keys(item).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).length, 0);
console.log(`wrote ${OUT.pathname}: openapi ${document.openapi}, ${Object.keys(document.paths).length} paths, ${operations} operations, ${Object.keys(document.components.schemas).length} schemas (from ${chunk})`);
