import 'dotenv/config';
import { cacheService } from '../services/cache.js';

const redis = cacheService.getClient();
await redis.del('lock', 'emergency_lock');
console.log('✓ Indexer locks cleared');
await cacheService.disconnect();
