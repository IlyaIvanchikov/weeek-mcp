import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { resolveSafeAttachPath } from "../src/attach.js";

// Real filesystem exploit tests: prove weeek_attach_file cannot be steered into
// reading files outside the configured WEEEK_ATTACH_DIR (the exfiltration vector).
let root: string;   // the allowed attach dir
let secret: string; // a sibling dir simulating "everything else on disk"

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "wk-attach-"));
  secret = await mkdtemp(join(tmpdir(), "wk-secret-"));
  await writeFile(join(root, "ok.txt"), "safe to share");
  await writeFile(join(secret, "id_rsa"), "PRIVATE KEY — must never leak");
  // a symlink INSIDE the allowed dir that points OUTSIDE it
  await symlink(join(secret, "id_rsa"), join(root, "sneaky-link"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(secret, { recursive: true, force: true });
});

const policy = () => ({ attachDir: root, maxBytes: 1_000_000 });

describe("resolveSafeAttachPath — attach sandbox", () => {
  it("allows a real regular file inside the allowed dir", async () => {
    const p = await resolveSafeAttachPath("ok.txt", policy());
    expect(basename(p)).toBe("ok.txt");
  });

  it("BLOCKS an absolute path outside the allowed dir (/etc/passwd)", async () => {
    await expect(resolveSafeAttachPath("/etc/passwd", policy()))
      .rejects.toThrow(/outside|not found/i);
  });

  it("BLOCKS an absolute path to a secret file outside the dir", async () => {
    await expect(resolveSafeAttachPath(join(secret, "id_rsa"), policy()))
      .rejects.toThrow(/outside/i);
  });

  it("BLOCKS `..` traversal escaping the allowed dir", async () => {
    const escape = join("..", basename(secret), "id_rsa"); // -> ../<secret>/id_rsa
    await expect(resolveSafeAttachPath(escape, policy()))
      .rejects.toThrow(/outside/i);
  });

  it("BLOCKS a symlink inside the dir that points outside it", async () => {
    await expect(resolveSafeAttachPath("sneaky-link", policy()))
      .rejects.toThrow(/outside/i);
  });

  it("BLOCKS files larger than maxBytes", async () => {
    await expect(resolveSafeAttachPath("ok.txt", { attachDir: root, maxBytes: 2 }))
      .rejects.toThrow(/too large/i);
  });

  it("BLOCKS a non-existent file", async () => {
    await expect(resolveSafeAttachPath("nope.txt", policy()))
      .rejects.toThrow(/not found/i);
  });
});
