interface Entry<T> { at: number; value: T; }

export class NameCache {
  private store = new Map<string, Entry<unknown>>();
  constructor(private ttlMs: number, private now: () => number = () => Date.now()) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key) as Entry<T> | undefined;
    if (hit && this.now() - hit.at <= this.ttlMs) return hit.value;
    const value = await load();
    this.store.set(key, { at: this.now(), value });
    return value;
  }

  invalidate(key: string): void { this.store.delete(key); }

  /** Drops `prefix` and every key scoped under it (`prefix:…`); `boards:1` does not touch `boards:10`. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) this.store.delete(key);
    }
  }
}
