interface Entry<T> { at: number; value: T; }

export class NameCache {
  private store = new Map<string, Entry<unknown>>();
  // Loads in flight, so parallel callers asking for one key share a single fetch.
  private loading = new Map<string, Promise<unknown>>();
  constructor(private ttlMs: number, private now: () => number = () => Date.now()) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key) as Entry<T> | undefined;
    if (hit && this.now() - hit.at <= this.ttlMs) return hit.value;
    const pendingLoad = this.loading.get(key) as Promise<T> | undefined;
    if (pendingLoad) return pendingLoad;
    // An invalidation removes this promise from `loading`; a load that lost that race is returned but not stored.
    const thisLoad: Promise<T> = load().then((value) => {
      if (this.loading.get(key) === thisLoad) this.store.set(key, { at: this.now(), value });
      return value;
    }).finally(() => {
      if (this.loading.get(key) === thisLoad) this.loading.delete(key);
    });
    this.loading.set(key, thisLoad);
    return thisLoad;
  }

  invalidate(key: string): void {
    this.store.delete(key);
    this.loading.delete(key);
  }

  /** Drops `prefix` and every key scoped under it (`prefix:…`); `boards:1` does not touch `boards:10`. */
  invalidatePrefix(prefix: string): void {
    for (const map of [this.store, this.loading]) {
      for (const key of map.keys()) {
        if (key === prefix || key.startsWith(`${prefix}:`)) map.delete(key);
      }
    }
  }
}
