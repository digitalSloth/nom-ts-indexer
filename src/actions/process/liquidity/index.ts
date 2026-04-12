import { registerHandler } from '../registry.js';
import { liquidityStake } from './liquidity-stake.js';
import { cancelLiquidityStake } from './cancel-liquidity-stake.js';

const CONTRACT = 'Liquidity Contract';

registerHandler(CONTRACT, 'LiquidityStake', liquidityStake);
registerHandler(CONTRACT, 'CancelLiquidityStake', cancelLiquidityStake);
