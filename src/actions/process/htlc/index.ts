import { registerHandler } from '../registry.js';
import { create } from './create.js';
import { unlock } from './unlock.js';
import { reclaim } from './reclaim.js';
import { allowProxyUnlock, denyProxyUnlock } from './proxy-unlock.js';

const CONTRACT = 'HTLC Contract';

registerHandler(CONTRACT, 'Create', create);
registerHandler(CONTRACT, 'Unlock', unlock);
registerHandler(CONTRACT, 'Reclaim', reclaim);
registerHandler(CONTRACT, 'AllowProxyUnlock', allowProxyUnlock);
registerHandler(CONTRACT, 'DenyProxyUnlock', denyProxyUnlock);
