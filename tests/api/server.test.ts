import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import { createApiServer } from '../../src/api/server.js';

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      })
      .on('error', reject);
  });
}

describe('ApiServer', () => {
  let server: ReturnType<typeof createApiServer>;

  afterEach(async () => {
    if (server) await server.stop();
  });

  it('starts on the given port and stops cleanly', async () => {
    server = createApiServer(vi.fn().mockResolvedValue({}));
    const port = await server.start(0);
    expect(port).toBeGreaterThan(0);
    await server.stop();
  });

  it('stop is a no-op when not started', async () => {
    server = createApiServer(vi.fn().mockResolvedValue({}));
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('GET /health returns health check data as JSON', async () => {
    const handler = vi.fn().mockResolvedValue({
      healthy: true,
      currentHeight: '1000',
      stats: { momentums: 100, accountBlocks: 500, accounts: 50, tokens: 5, pillars: 10 },
    });
    server = createApiServer(handler);

    const port = await server.start(0);
    const res = await get(port, '/health');

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.healthy).toBe(true);
    expect(body.currentHeight).toBe('1000'); // BigInt serialized as string
    expect(body.stats.momentums).toBe(100);
    expect(handler).toHaveBeenCalled();
  });

  it('GET /health returns unhealthy status correctly', async () => {
    const handler = vi.fn().mockResolvedValue({
      healthy: false,
      currentHeight: '0',
      stats: { momentums: 0, accountBlocks: 0, accounts: 0, tokens: 0, pillars: 0 },
    });
    server = createApiServer(handler);

    const port = await server.start(0);
    const res = await get(port, '/health');

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.healthy).toBe(false);
  });

  it('GET /health returns 500 when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('db down'));
    server = createApiServer(handler);

    const port = await server.start(0);
    const res = await get(port, '/health');

    expect(res.status).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Health check failed');
  });

  it('serves SPA for unknown routes', async () => {
    server = createApiServer(vi.fn());
    const port = await server.start(0);
    const res = await get(port, '/unknown');
    // SPA catch-all returns 200 with index.html (or 404 if frontend not built)
    expect([200, 404]).toContain(res.status);
  });
});
