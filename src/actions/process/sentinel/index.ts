import { registerHandler } from '../registry.js';
import { register } from './register.js';
import { revoke } from './revoke.js';

const CONTRACT = 'Sentinel Contract';

registerHandler(CONTRACT, 'Register', register);
registerHandler(CONTRACT, 'Revoke', revoke);
