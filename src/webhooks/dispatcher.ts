import { createHmac } from 'node:crypto';
import { webhooksConfig } from '../config/webhooks.js';
import type { WebhookEvent, WebhookEventType, WebhookSubscription } from './types.js';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const REQUEST_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return base + jitter;
}

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

export class WebhookDispatcher {
  private readonly subscriptions: WebhookSubscription[];

  constructor(subscriptions: WebhookSubscription[]) {
    this.subscriptions = subscriptions;
  }

  dispatch(event: WebhookEventType, payload: unknown): void {
    if (this.subscriptions.length === 0) {
      return;
    }

    const targets = this.subscriptions.filter((s) => s.events.includes(event));
    if (targets.length === 0) {
      return;
    }

    const envelope: WebhookEvent = {
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    };
    const body = JSON.stringify(envelope);

    for (const sub of targets) {
      void this.deliver(sub, body, event).catch((err) => {
        console.error(`[webhooks] unexpected error delivering ${event} to ${sub.url}:`, err);
      });
    }
  }

  private async deliver(
    sub: WebhookSubscription,
    body: string,
    event: WebhookEventType,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
    };
    if (sub.secret) {
      headers['X-Webhook-Signature'] = sign(sub.secret, body);
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(sub.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) {
          return;
        }
        console.error(
          `[webhooks] ${event} -> ${sub.url} attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: HTTP ${res.status}`,
        );
      } catch (err) {
        console.error(
          `[webhooks] ${event} -> ${sub.url} attempt ${attempt + 1}/${MAX_ATTEMPTS} error:`,
          (err as Error).message,
        );
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffDelay(attempt));
      }
    }

    console.error(`[webhooks] ${event} -> ${sub.url} giving up after ${MAX_ATTEMPTS} attempts`);
  }
}

export const webhookDispatcher = new WebhookDispatcher(webhooksConfig);
