import { registerHandler } from '../registry.js';
import { create, createWithReclaimLock } from './create.js';
import { unlock, proxyUnlock } from './unlock.js';
import { reclaim, reclaimWithSignature } from './reclaim.js';

const CONTRACT = 'PTLC Contract';

registerHandler(CONTRACT, 'Create', create);
registerHandler(CONTRACT, 'CreateWithReclaimLock', createWithReclaimLock);
registerHandler(CONTRACT, 'Unlock', unlock);
registerHandler(CONTRACT, 'ProxyUnlock', proxyUnlock);
registerHandler(CONTRACT, 'Reclaim', reclaim);
registerHandler(CONTRACT, 'ReclaimWithSignature', reclaimWithSignature);
