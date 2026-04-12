import { databaseService } from '../database.js';

/**
 * Resolves the pillar that produced a momentum from its producer account id.
 *
 * Pillars are small in number (≤ ~200) and rarely change producer addresses,
 * but every momentum needs this attribution — putting it in memory eliminates a
 * `findFirst` (and a fallback `findFirst` from history) per momentum.
 * The map is loaded once on startup and refreshed by pillar action handlers.
 */
class PillarRegistry {
  private byProducerAccountId = new Map<number, number>();
  private loaded = false;

  async load(): Promise<void> {
    const db = databaseService.getDb();
    this.byProducerAccountId.clear();

    const pillars = await db('nom_pillars').select('id', 'producer_account_id');
    for (const p of pillars) {
      this.byProducerAccountId.set(p.producer_account_id, p.id);
    }

    // History lets us still attribute momentums whose producer was rotated to
    // a different pillar — fall through to the historical mapping when the live
    // mapping does not match.
    const history = await db('nom_pillar_update_histories').select(
      'pillar_id',
      'producer_account_id',
    );
    for (const h of history) {
      if (!this.byProducerAccountId.has(h.producer_account_id)) {
        this.byProducerAccountId.set(h.producer_account_id, h.pillar_id);
      }
    }

    this.loaded = true;
    console.log(
      `✓ Pillar registry loaded: ${pillars.length} live + ${history.length} historical mappings`,
    );
  }

  getPillarId(producerAccountId: number): number | null {
    return this.byProducerAccountId.get(producerAccountId) ?? null;
  }

  setPillarId(producerAccountId: number, pillarId: number): void {
    this.byProducerAccountId.set(producerAccountId, pillarId);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  clear(): void {
    this.byProducerAccountId.clear();
    this.loaded = false;
  }
}

export const pillarRegistry = new PillarRegistry();
