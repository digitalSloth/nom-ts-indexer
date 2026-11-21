# Webhooks

The indexer posts an HTTP callback for each momentum it commits and for each account block in that momentum. `src/webhooks/dispatcher.ts` sends them. Configuration is read once at startup, so restart the indexer to change endpoints.

## Configuration

Subscriptions come from two sources, and the indexer combines them.

**File.** `webhooks.json` in the working directory, or the path in `WEBHOOKS_CONFIG_PATH`. `webhooks.example.json` shows the format:

```json
{
  "webhooks": [
    {
      "url": "https://example.com/hooks/momentum",
      "events": ["momentum.inserted"],
      "secret": "optional-hmac-secret"
    },
    {
      "url": "https://example.com/hooks/all",
      "events": ["momentum.inserted", "account_block.inserted"]
    }
  ]
}
```

**Environment.** `WEBHOOK_URL` adds one subscription. `WEBHOOK_SECRET` sets its signing secret. `WEBHOOK_EVENTS` is a comma-separated event list, and its default is both events.

A missing file means no file subscriptions. An invalid URL, an empty or unknown `events` entry, a non-string `secret` or unparseable JSON stops the indexer at startup.

The Docker image contains no `webhooks.json`. In Docker, use the `WEBHOOK_*` variables, or mount a file and point `WEBHOOKS_CONFIG_PATH` at it.

## Requests

Each event is a `POST` with a JSON body and these headers:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | The event name |
| `X-Webhook-Signature` | `sha256=<hex>`, only when the subscription has a `secret` |

The body is an envelope. `timestamp` is the time the indexer sent the event, as an ISO string.

```json
{
  "event": "momentum.inserted",
  "timestamp": "2026-11-22T10:00:00.000Z",
  "data": { "height": "12345678", "hash": "…", "timestamp": 1795000000 }
}
```

## Events

| Event | Fired | `data` |
|-------|-------|--------|
| `momentum.inserted` | Once per momentum, after its transaction commits | `{ height: string, hash: string, timestamp: number }`. `timestamp` is the momentum time in unix seconds |
| `account_block.inserted` | Once per account block in that momentum, including blocks an earlier run already stored | `{ momentumHeight: string, hash: string, address: string, toAddress: string, blockType: number }` |

`blockType` uses the values in [schema.md](schema.md#account-blocks).

## Delivery

- Each request times out after 5 s. Any response other than 2xx counts as a failure.
- The indexer makes up to 3 attempts per subscription, with a backoff of 500 ms doubling per attempt plus up to 500 ms of jitter. After the third failure it logs the event and drops it.
- Requests run concurrently and do not block indexing, so a receiver can see events out of order.
- Nothing is stored or replayed. A crash between the commit and the request loses that momentum's events, and a restart does not resend them. Use the database as the source of truth, and webhooks as a signal to read it.

## Verifying the signature

`X-Webhook-Signature` is the HMAC-SHA256 of the raw request body with the subscription's `secret`, in hex. Compute it over the exact bytes received, before any JSON parsing:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

The signature does not cover a separate timestamp. To reject replayed requests, check the envelope `timestamp` as well.
