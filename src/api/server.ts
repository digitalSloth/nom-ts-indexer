import express from 'express';
import type http from 'node:http';
import { healthCheck } from './health.js';

export function createApiServer(healthHandler: () => Promise<unknown> = healthCheck) {
  const app = express();
  let server: http.Server | null = null;

  // CORS for development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      const result = await healthHandler();
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Health check failed' });
    }
  });

  return {
    async start(port: number): Promise<number> {
      return new Promise((resolve) => {
        server = app.listen(port, () => {
          const addr = server!.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : port;
          console.log(`API server listening on port ${actualPort}`);
          resolve(actualPort);
        });
      });
    },

    async stop(): Promise<void> {
      if (!server) return;
      return new Promise((resolve, reject) => {
        server!.close((err) => {
          if (err) reject(err);
          else {
            server = null;
            resolve();
          }
        });
      });
    },
  };
}

export const apiServer = createApiServer();
