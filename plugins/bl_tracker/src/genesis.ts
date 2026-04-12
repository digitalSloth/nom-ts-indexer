import { promises as fs } from 'node:fs';
import type { PluginContext } from '../../../src/plugins/types.js';

const ZNN_TOKEN_STANDARD = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const QSR_TOKEN_STANDARD = 'zts1qsrxxxxxxxxxxxxxmrhjll';

export async function seedGenesisBalances(ctx: PluginContext): Promise<void> {
  const raw = await fs.readFile(ctx.genesisPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const blocks = parsed.GenesisBlocks?.Blocks ?? [];
  if (blocks.length === 0) return;

  ctx.log.info(`seeding ${blocks.length} genesis balances`);

  for (const block of blocks) {
    const balances = block.BalanceList ?? {};
    const znnBalance = BigInt(balances[ZNN_TOKEN_STANDARD] || '0');
    const qsrBalance = BigInt(balances[QSR_TOKEN_STANDARD] || '0');

    if (znnBalance === 0n && qsrBalance === 0n) continue;

    const rows = await ctx.db.query<{ id: number }>(
      'SELECT id FROM nom_accounts WHERE address = $1',
      block.Address,
    );
    const accountId = rows[0]?.id;
    if (accountId === undefined) continue;

    await ctx.db.execute(
      `INSERT INTO bl_tracker_balances (account_id, znn_balance, qsr_balance, znn_received, qsr_received, genesis_znn_balance, genesis_qsr_balance, updated_at)
       VALUES ($1::int, $2, $3, $2, $3, $2, $3, NOW()::timestamp)
       ON CONFLICT (account_id) DO UPDATE SET
         znn_balance = EXCLUDED.znn_balance,
         qsr_balance = EXCLUDED.qsr_balance,
         znn_received = EXCLUDED.znn_received,
         qsr_received = EXCLUDED.qsr_received,
         genesis_znn_balance = EXCLUDED.genesis_znn_balance,
         genesis_qsr_balance = EXCLUDED.genesis_qsr_balance,
         updated_at = NOW()::timestamp`,
      accountId,
      znnBalance.toString(),
      qsrBalance.toString(),
    );
  }

  ctx.log.info('genesis balance seeding complete');
}
