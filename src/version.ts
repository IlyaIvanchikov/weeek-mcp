import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Single source of truth for the server's identity: read straight from the
// package.json that ships with the build (dist/../package.json), so the version
// can never drift from what npm published. Works from both src (tests) and dist.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { name: string; version: string };

export const NAME = pkg.name;
export const VERSION = pkg.version;
