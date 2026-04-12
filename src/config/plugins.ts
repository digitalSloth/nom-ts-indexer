import fs from 'node:fs';
import path from 'node:path';

export interface PluginEntry {
  package: string;
  enabled: boolean;
  config: Record<string, unknown>;
  startHeight?: number;
}

interface PluginsFile {
  plugins?: PluginEntry[];
}

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'plugins.json');
const configPath = process.env.PLUGINS_CONFIG_PATH || DEFAULT_CONFIG_PATH;

let pluginsConfig: PluginEntry[] = [];

if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed: PluginsFile = JSON.parse(raw);
    if (Array.isArray(parsed.plugins)) {
      pluginsConfig = parsed.plugins.filter((p) => p.enabled);
    }
  } catch (err) {
    console.warn(`Failed to load plugins config from ${configPath}:`, err);
  }
}

export function isLocalPlugin(entry: PluginEntry): boolean {
  return entry.package.startsWith('.') || entry.package.startsWith('/');
}

export { pluginsConfig };
