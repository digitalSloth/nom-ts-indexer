import type { AccountBlock } from 'znn-typescript-sdk';

/**
 * Link descendant (child) blocks to their parent by setting `parent_id`.
 * Skips children that already have a parent or aren't in the DB yet.
 */
export async function linkDescendantBlocks(
  tx: any,
  parentId: number,
  descendants: AccountBlock[],
): Promise<void> {
  for (const d of descendants) {
    const childHash = d.hash.toString();
    const child = await tx('nom_account_blocks')
      .where({ hash: childHash })
      .select('id', 'parent_id')
      .first();

    if (child && !child.parent_id) {
      await tx('nom_account_blocks').where({ id: child.id }).update({ parent_id: parentId });
    }
  }
}
