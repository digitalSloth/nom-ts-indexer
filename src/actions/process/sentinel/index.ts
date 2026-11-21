import { registerHandler } from '../registry.js';
import { register } from './register.js';
import { revoke } from './revoke.js';
import { depositQsr, withdrawQsr } from '../pillar/qsr-deposit.js';

const CONTRACT = 'Sentinel Contract';

registerHandler(CONTRACT, 'Register', register);
registerHandler(CONTRACT, 'Revoke', revoke);
registerHandler(CONTRACT, 'DepositQsr', depositQsr);
registerHandler(CONTRACT, 'WithdrawQsr', withdrawQsr);
