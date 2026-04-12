import { registerHandler } from '../registry.js';
import { issueToken } from './issue-token.js';
import { updateToken } from './update-token.js';
import { mint } from './mint.js';
import { burn } from './burn.js';

const CONTRACT = 'Token Contract';

registerHandler(CONTRACT, 'IssueToken', issueToken);
registerHandler(CONTRACT, 'UpdateToken', updateToken);
registerHandler(CONTRACT, 'Mint', mint);
registerHandler(CONTRACT, 'Burn', burn);
