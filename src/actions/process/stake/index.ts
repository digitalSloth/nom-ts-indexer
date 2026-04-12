import { registerHandler } from '../registry.js';
import { stake } from './stake.js';
import { cancel } from './cancel.js';

const CONTRACT = 'Stake Contract';

registerHandler(CONTRACT, 'Stake', stake);
registerHandler(CONTRACT, 'Cancel', cancel);
