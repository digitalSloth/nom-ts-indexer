import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { pillarRegistry } from '../../../services/registries/pillar-registry.js';
import {
  PILLAR_QSR_STAKE_BASE_AMOUNT,
  PILLAR_QSR_STAKE_INCREASE_AMOUNT,
} from '../../../constants/zenon.js';
import { slugify } from '../../../helpers/slugify.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';

function assertPillarParams(decoded: Record<string, any>): void {
  assertRequiredFields(
    decoded,
    [
      'name',
      'producerAddress',
      'rewardAddress',
      'giveBlockRewardPercentage',
      'giveDelegateRewardPercentage',
    ],
    'Pillar.Register',
  );
  if (typeof decoded.name !== 'string' || decoded.name.length === 0) {
    throw new Error('Pillar.Register: name is empty');
  }
}

export const register: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertPillarParams(decoded);

  const name = decoded.name as string;
  const producerAddress = decoded.producerAddress.toString();
  const rewardAddress = decoded.rewardAddress.toString();

  const producerAccountId = await accountRegistry.getOrCreate(tx, producerAddress);
  const withdrawAccountId = await accountRegistry.getOrCreate(tx, rewardAddress);

  const countRow = await tx('nom_pillars').where({ is_legacy: false }).count('* as c').first();
  const normalCount = Number(countRow?.c ?? 0);
  const qsrBurn =
    PILLAR_QSR_STAKE_BASE_AMOUNT + PILLAR_QSR_STAKE_INCREASE_AMOUNT * BigInt(normalCount);

  const [pillar] = await tx('nom_pillars')
    .insert({
      owner_id: sendBlock.accountId,
      producer_account_id: producerAccountId,
      withdraw_account_id: withdrawAccountId,
      name,
      slug: slugify(name),
      qsr_burn: qsrBurn,
      momentum_rewards: Number(decoded.giveBlockRewardPercentage),
      delegate_rewards: Number(decoded.giveDelegateRewardPercentage),
      is_legacy: false,
      created_at: receiveBlock.createdAt,
    })
    .returning('id');

  pillarRegistry.setPillarId(producerAccountId, pillar.id);
};
