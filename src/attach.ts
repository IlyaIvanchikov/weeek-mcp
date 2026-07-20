import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

export interface AttachPolicy {
  /**
   * Directory whose files (and subdirectories) may be attached. Defaults to the
   * server's working directory (set by the caller); overridable via WEEEK_ATTACH_DIR.
   */
  attachDir: string;
  /** Maximum attachable file size, in bytes. */
  maxBytes: number;
}

/**
 * Resolve a caller-supplied path to a safe absolute path, or throw.
 *
 * Security: `weeek_attach_file` is driven by an LLM that reads untrusted content
 * (task titles, web pages, other tool output), so `path` is attacker-influenced.
 * Without this guard the tool is an arbitrary-file-read-and-exfiltrate primitive.
 * The rules:
 *   1. the file's REAL path (symlinks resolved) must sit inside `attachDir`,
 *      which blocks absolute paths, `..` traversal, and symlink escape;
 *   2. only regular files under `maxBytes` are accepted.
 * `attachDir` defaults to the working directory, so the tool works with no
 * configuration for local files while still refusing anything outside that tree.
 */
export async function resolveSafeAttachPath(requested: string, policy: AttachPolicy): Promise<string> {
  const root = await realpath(policy.attachDir);
  const candidate = resolve(root, requested);
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new Error("weeek_attach_file: file not found");
  }
  if (real !== root && !real.startsWith(root + sep)) {
    throw new Error("weeek_attach_file: path is outside the allowed WEEEK_ATTACH_DIR");
  }
  const info = await stat(real);
  if (!info.isFile()) throw new Error("weeek_attach_file: not a regular file");
  if (info.size > policy.maxBytes) {
    throw new Error(`weeek_attach_file: file too large (${info.size} > ${policy.maxBytes} bytes)`);
  }
  return real;
}
