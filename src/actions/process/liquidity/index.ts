import { registerHandler } from '../registry.js';
import { liquidityStake } from './liquidity-stake.js';
import { cancelLiquidityStake } from './cancel-liquidity-stake.js';
import { setTokenTuple } from './set-token-tuple.js';
import { setIsHalted } from './set-is-halted.js';
import { setAdditionalReward } from './set-additional-reward.js';
import { unlockLiquidityStakeEntries } from './unlock-liquidity-stake-entries.js';
import { emergency } from './emergency.js';
import { LIQUIDITY_GOVERNANCE } from '../bridge/governance.js';
import { makeChangeAdministrator } from '../bridge/change-administrator.js';
import { makeNominateGuardians } from '../bridge/nominate-guardians.js';
import { makeProposeAdministrator } from '../bridge/propose-administrator.js';

const CONTRACT = LIQUIDITY_GOVERNANCE.contractName;

registerHandler(CONTRACT, 'LiquidityStake', liquidityStake);
registerHandler(CONTRACT, 'CancelLiquidityStake', cancelLiquidityStake);
registerHandler(CONTRACT, 'SetTokenTuple', setTokenTuple);
registerHandler(CONTRACT, 'SetIsHalted', setIsHalted);
registerHandler(CONTRACT, 'SetAdditionalReward', setAdditionalReward);
registerHandler(CONTRACT, 'UnlockLiquidityStakeEntries', unlockLiquidityStakeEntries);
registerHandler(CONTRACT, 'Emergency', emergency);
registerHandler(CONTRACT, 'ChangeAdministrator', makeChangeAdministrator(LIQUIDITY_GOVERNANCE));
registerHandler(CONTRACT, 'NominateGuardians', makeNominateGuardians(LIQUIDITY_GOVERNANCE));
registerHandler(CONTRACT, 'ProposeAdministrator', makeProposeAdministrator(LIQUIDITY_GOVERNANCE));
