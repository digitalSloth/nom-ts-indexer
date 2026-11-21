import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookDispatcher } from '../../src/webhooks/dispatcher.js';
import type { WebhookSubscription } from '../../src/webhooks/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WebhookDispatcher', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make(subs: WebhookSubscription[]) {
    return new WebhookDispatcher(subs);
  }

  it('does nothing with no subscriptions', () => {
    const d = make([]);
    d.dispatch('momentum.inserted', { height: '1' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips subscriptions that do not match the event', () => {
    const d = make([{ url: 'https://example.com', events: ['account_block.inserted'] }]);
    d.dispatch('momentum.inserted', { height: '1' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('delivers to matching subscriptions', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const d = make([{ url: 'https://example.com/hook', events: ['momentum.inserted'] }]);

    d.dispatch('momentum.inserted', { height: '100', hash: 'abc', timestamp: 123 });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Webhook-Event']).toBe('momentum.inserted');

    const body = JSON.parse(opts.body);
    expect(body.event).toBe('momentum.inserted');
    expect(body.data).toEqual({ height: '100', hash: 'abc', timestamp: 123 });
  });

  it('includes HMAC signature when secret is set', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const d = make([
      {
        url: 'https://example.com/hook',
        events: ['momentum.inserted'],
        secret: 'mysecret',
      },
    ]);

    d.dispatch('momentum.inserted', { height: '1' });
    await vi.advanceTimersByTimeAsync(0);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('does not include signature header when no secret', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const d = make([{ url: 'https://example.com/hook', events: ['momentum.inserted'] }]);

    d.dispatch('momentum.inserted', { height: '1' });
    await vi.advanceTimersByTimeAsync(0);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Webhook-Signature']).toBeUndefined();
  });

  it('retries on HTTP failure up to MAX_ATTEMPTS', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = make([{ url: 'https://example.com/hook', events: ['momentum.inserted'] }]);

    d.dispatch('momentum.inserted', { height: '1' });
    await vi.advanceTimersByTimeAsync(10000);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('giving up after 3 attempts'));
    errorSpy.mockRestore();
  });

  it('retries on fetch error up to MAX_ATTEMPTS', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = make([{ url: 'https://example.com/hook', events: ['momentum.inserted'] }]);

    d.dispatch('momentum.inserted', { height: '1' });
    await vi.advanceTimersByTimeAsync(10000);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('giving up after 3 attempts'));
    errorSpy.mockRestore();
  });

  it('does not retry after successful delivery', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const d = make([{ url: 'https://example.com/hook', events: ['momentum.inserted'] }]);

    d.dispatch('momentum.inserted', { height: '1' });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('delivers to multiple matching subscriptions', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const d = make([
      { url: 'https://a.com', events: ['momentum.inserted'] },
      { url: 'https://b.com', events: ['momentum.inserted', 'account_block.inserted'] },
      { url: 'https://c.com', events: ['account_block.inserted'] },
    ]);

    d.dispatch('momentum.inserted', { height: '1' });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain('https://a.com');
    expect(urls).toContain('https://b.com');
    expect(urls).not.toContain('https://c.com');
  });
});
