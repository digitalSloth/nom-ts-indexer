import { registerHandler } from '../registry.js';
import { fuse } from './fuse.js';
import { cancelFuse } from './cancel-fuse.js';

const CONTRACT = 'Plasma Contract';

registerHandler(CONTRACT, 'Fuse', fuse);
registerHandler(CONTRACT, 'CancelFuse', cancelFuse);
