import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function stripFences(markdown: string): string {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
}

// GitHub heading anchor.
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

describe('relative links', () => {
  const files = [
    'README.md',
    'AGENTS.md',
    ...fs
      .readdirSync(path.join(root, 'docs'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `docs/${f}`),
  ];

  it.each(files)('%s links resolve', (file) => {
    const text = stripFences(read(file));
    const broken: string[] = [];
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [filePart, anchor] = target.split('#');
      const resolved = filePart
        ? path.resolve(root, path.dirname(file), filePart)
        : path.join(root, file);
      if (!fs.existsSync(resolved)) {
        broken.push(`${target}: file not found`);
        continue;
      }
      if (anchor && resolved.endsWith('.md')) {
        const headings = [
          ...stripFences(fs.readFileSync(resolved, 'utf8')).matchAll(/^#{1,6} +(.+)$/gm),
        ].map((m) => slug(m[1]));
        if (!headings.includes(anchor)) broken.push(`${target}: anchor not found`);
      }
    }
    expect(broken).toEqual([]);
  });
});
