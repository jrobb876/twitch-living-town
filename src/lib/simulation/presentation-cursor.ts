/** Per-view ephemeral delivery. A fresh view baselines the current buffer instead
 * of replaying history. Existing views retain their cursor across reconnects.
 * No global acknowledgments, credentials, browser storage or durable writes. */
export class PresentationCursor {
  private initialized = false;
  private seen = new Map<string, number>();

  take<T extends { id: string; expiresAt: number }>(items: T[], now: number): T[] {
    for (const [id, expiry] of this.seen) if (expiry <= now) this.seen.delete(id);
    const fresh: T[] = [];
    for (const item of items) {
      if (item.expiresAt <= now || this.seen.has(item.id)) continue;
      // Saturation drops excess ephemeral work rather than evicting handled IDs and replaying them.
      if (this.seen.size >= 2048) continue;
      this.seen.set(item.id, item.expiresAt);
      if (this.initialized) fresh.push(item);
    }
    this.initialized = true;
    return fresh;
  }
  clear() { this.initialized = false; this.seen.clear(); }
}
