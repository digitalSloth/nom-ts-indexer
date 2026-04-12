import { registerHandler } from '../registry.js';
import { createProject } from './create-project.js';
import { addPhase } from './add-phase.js';
import { updatePhase } from './update-phase.js';
import { donate } from './donate.js';
import { update } from './update.js';
import { voteByName } from './vote-by-name.js';
import { voteByProdAddress } from './vote-by-prod-address.js';

const CONTRACT = 'Accelerator Contract';

registerHandler(CONTRACT, 'Donate', donate);
registerHandler(CONTRACT, 'CreateProject', createProject);
registerHandler(CONTRACT, 'AddPhase', addPhase);
registerHandler(CONTRACT, 'Update', update);
registerHandler(CONTRACT, 'UpdatePhase', updatePhase);
registerHandler(CONTRACT, 'VoteByName', voteByName);
registerHandler(CONTRACT, 'VoteByProdAddress', voteByProdAddress);
