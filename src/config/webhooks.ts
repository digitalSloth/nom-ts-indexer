import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import type { WebhookEventType, WebhookSubscription } from '../webhooks/types.js';

dotenv.config();

const KNOWN_EVENTS: readonly WebhookEventType[] = ['momentum.inserted', 'account_block.inserted'];

interface WebhooksFile {
  webhooks?: Array<{
    url?: unknown;
    events?: unknown;
    secret?: unknown;
  }>;
}

function isKnownEvent(value: string): value is WebhookEventType {
  return (KNOWN_EVENTS as readonly string[]).includes(value);
}

function validateUrl(url: string, source: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid webhook URL in ${source}: ${url}`);
  }
}

function validateEvents(events: unknown, source: string): WebhookEventType[] {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`Webhook ${source} must have a non-empty 'events' array`);
  }
  const out: WebhookEventType[] = [];
  for (const e of events) {
    if (typeof e !== 'string' || !isKnownEvent(e)) {
      throw new Error(
        `Unknown webhook event in ${source}: ${String(e)}. Known events: ${KNOWN_EVENTS.join(', ')}`,
      );
    }
    out.push(e);
  }
  return out;
}

function loadFromFile(): WebhookSubscription[] {
  const path = resolve(process.env.WEBHOOKS_CONFIG_PATH || 'webhooks.json');
  if (!existsSync(path)) {
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read webhook config at ${path}: ${(err as Error).message}`);
  }

  if (raw.trim() === '') {
    return [];
  }

  let parsed: WebhooksFile;
  try {
    parsed = JSON.parse(raw) as WebhooksFile;
  } catch (err) {
    throw new Error(`Failed to parse webhook config at ${path}: ${(err as Error).message}`);
  }

  if (!parsed.webhooks) {
    return [];
  }
  if (!Array.isArray(parsed.webhooks)) {
    throw new Error(`Webhook config at ${path}: 'webhooks' must be an array`);
  }

  return parsed.webhooks.map((entry, idx) => {
    const source = `${path}#webhooks[${idx}]`;
    if (typeof entry.url !== 'string' || entry.url.trim() === '') {
      throw new Error(`Webhook ${source} must have a string 'url'`);
    }
    validateUrl(entry.url, source);
    const events = validateEvents(entry.events, source);
    if (entry.secret !== undefined && typeof entry.secret !== 'string') {
      throw new Error(`Webhook ${source}: 'secret' must be a string if provided`);
    }
    const sub: WebhookSubscription = { url: entry.url, events };
    if (typeof entry.secret === 'string' && entry.secret.length > 0) {
      sub.secret = entry.secret;
    }
    return sub;
  });
}

function loadFromEnv(): WebhookSubscription[] {
  const url = process.env.WEBHOOK_URL;
  if (!url || url.trim() === '') {
    return [];
  }
  validateUrl(url, 'WEBHOOK_URL');

  let events: WebhookEventType[];
  const filter = process.env.WEBHOOK_EVENTS;
  if (filter && filter.trim() !== '') {
    const parts = filter
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    events = validateEvents(parts, 'WEBHOOK_EVENTS');
  } else {
    events = [...KNOWN_EVENTS];
  }

  const sub: WebhookSubscription = { url, events };
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && secret.length > 0) {
    sub.secret = secret;
  }
  return [sub];
}

export const webhooksConfig: WebhookSubscription[] = [...loadFromFile(), ...loadFromEnv()];
