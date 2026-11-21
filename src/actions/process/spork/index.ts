import { registerHandler } from '../registry.js';
import { createSpork } from './create-spork.js';
import { activateSpork } from './activate-spork.js';

const CONTRACT = 'Spork Contract';

registerHandler(CONTRACT, 'CreateSpork', createSpork);
registerHandler(CONTRACT, 'ActivateSpork', activateSpork);
