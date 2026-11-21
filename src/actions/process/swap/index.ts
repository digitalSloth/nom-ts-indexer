import { registerHandler } from '../registry.js';
import { retrieveAssets } from './retrieve-assets.js';

const CONTRACT = 'Swap Contract';

registerHandler(CONTRACT, 'RetrieveAssets', retrieveAssets);
