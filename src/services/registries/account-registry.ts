/**
 * In-memory address → accountId cache, LRU-bounded so a multi-million-account
 * chain does not blow out the Node heap. Cache misses fall through to a Postgres
 * upsert. The same instance is shared across the indexer; safe under a single
 * processor (serial batches) — would need rethinking if we ever process batches
 * in parallel.
 */

const MAX_ENTRIES = 500_000;

class AccountRegistry {
  private map = new Map<string, number>();

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  get(address: string): number | undefined {
    const id = this.map.get(address);
    if (id !== undefined) {
      // Bump recency: re-insert moves the entry to the most-recent slot.
      this.map.delete(address);
      this.map.set(address, id);
    }
    return id;
  }

  set(address: string, id: number): void {
    if (this.map.has(address)) {
      this.map.delete(address);
    } else if (this.map.size >= MAX_ENTRIES) {
      // Drop the oldest (least-recently-used) entry.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(address, id);
  }

  /**
   * Cache hit → Map lookup.
   * Cache miss → upsert (single round-trip, race-safe under @unique address).
   */
  async getOrCreate(txOrDb: any, address: string): Promise<number> {
    const cached = this.get(address);
    if (cached !== undefined) return cached;

    const [account] = await txOrDb('nom_accounts')
      .insert({ address })
      .onConflict('address')
      .merge()
      .returning('id');
    this.set(address, account.id);
    return account.id;
  }
}

export const accountRegistry = new AccountRegistry();
