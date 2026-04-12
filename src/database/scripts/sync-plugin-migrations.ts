/**
 * Sync plugin migrations into the core migrations/plugins directory.
 * This allows knex to run all migrations from a single directory array.
 *
 * Usage: tsx src/database/scripts/sync-plugin-migrations.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const PLUGINS_DIR = path.resolve(ROOT, 'src/database/migrations/plugins');

interface PluginEntry {
  package: string;
  enabled: boolean;
}

function loadPluginsConfig(): PluginEntry[] {
  const configPath = path.resolve(ROOT, process.env.PLUGINS_CONFIG_PATH || 'plugins.json');
  if (!fs.existsSync(configPath)) return [];
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return (raw.plugins ?? []).filter((p: PluginEntry) => p.enabled);
}

function isLocal(entry: PluginEntry): boolean {
  return entry.package.startsWith('.') || entry.package.startsWith('/');
}

async function main() {
  // Ensure target directory exists
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });

  const plugins = loadPluginsConfig().filter(isLocal);
  if (plugins.length === 0) {
    console.log('No local plugins found.');
    return;
  }

  let copied = 0;
  let skipped = 0;

  for (const entry of plugins) {
    const pluginDir = path.resolve(ROOT, entry.package);
    const migrationsDir = path.join(pluginDir, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      continue;
    }

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.cjs'));

    for (const file of files) {
      const src = path.join(migrationsDir, file);
      const dest = path.join(PLUGINS_DIR, file);

      // Check for filename collision with a different file
      if (fs.existsSync(dest)) {
        const srcContent = fs.readFileSync(src);
        const destContent = fs.readFileSync(dest);
        if (srcContent.equals(destContent)) {
          skipped++;
          continue;
        }
        console.error(
          `Collision: ${file} exists with different content. Migration filenames must be globally unique.`,
        );
        process.exit(1);
      }

      fs.copyFileSync(src, dest);
      copied++;
    }
  }

  console.log(`Plugin migrations synced: ${copied} copied, ${skipped} unchanged.`);
}

main().catch((err) => {
  console.error('sync-plugin-migrations failed:', err.message);
  process.exit(1);
});
