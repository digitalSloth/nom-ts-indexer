import { registerHandler } from '../registry.js';
import { register } from './register.js';
import { registerLegacy } from './register-legacy.js';
import { updatePillar } from './update-pillar.js';
import { revoke } from './revoke.js';
import { delegate } from './delegate.js';
import { undelegate } from './undelegate.js';
import { depositQsr, withdrawQsr } from './qsr-deposit.js';

const CONTRACT = 'Pillar Contract';

registerHandler(CONTRACT, 'Register', register);
registerHandler(CONTRACT, 'RegisterLegacy', registerLegacy);
registerHandler(CONTRACT, 'UpdatePillar', updatePillar);
registerHandler(CONTRACT, 'Revoke', revoke);
registerHandler(CONTRACT, 'Delegate', delegate);
registerHandler(CONTRACT, 'Undelegate', undelegate);
registerHandler(CONTRACT, 'DepositQsr', depositQsr);
registerHandler(CONTRACT, 'WithdrawQsr', withdrawQsr);
