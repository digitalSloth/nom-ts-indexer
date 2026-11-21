import WebSocket from 'ws';

/**
 * Node health checks for failover. A probe opens its own short-lived
 * WebSocket, so it never disturbs the connection the indexer is using. It
 * uses the `ws` library, as the SDK does, so a probe connects to a node
 * exactly when the indexer can.
 */

/** The last indexed momentum. A usable node must have it on its chain. */
export interface ChainAnchor {
  height: bigint;
  /** Null when the momentum row is not stored, for example below START_HEIGHT. */
  hash: string | null;
}

/** What a node reports about its chain. */
export interface NodeStatus {
  chainId: number;
  frontierHeight: bigint;
  /** The node's momentum hash at the anchor height, when one was read. */
  anchorHash: string | null;
}

/**
 * A node may trail the most advanced node by this many momentums (about
 * 100 s) and still be chosen. Further behind, it is treated as stuck.
 */
export const MAX_NODE_LAG = 10n;

/**
 * Reads a node's chain id and frontier, and its momentum hash at the
 * anchor height, over a new WebSocket that closes afterwards.
 */
export function probeNode(
  url: string,
  anchorHeight: bigint | null,
  timeoutMs: number,
): Promise<NodeStatus> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map<number, (message: any) => void>();
    let nextId = 1;
    let settled = false;

    const finish = (error: Error | null, status?: NodeStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.terminate();
      if (error) reject(error);
      else resolve(status!);
    };

    const timer = setTimeout(
      () => finish(new Error(`no response within ${timeoutMs / 1000}s`)),
      timeoutMs,
    );

    const call = (method: string, params: unknown[]) =>
      new Promise<any>((resolveCall, rejectCall) => {
        const id = nextId++;
        pending.set(id, (message) => {
          if (message.error) rejectCall(new Error(message.error.message ?? 'RPC error'));
          else resolveCall(message.result);
        });
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      });

    ws.on('message', (data) => {
      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      // Subscription notifications carry no id
      const handler = pending.get(message?.id);
      if (!handler) return;
      pending.delete(message.id);
      handler(message);
    });
    ws.on('error', (error: NodeJS.ErrnoException) =>
      finish(new Error(`connection failed: ${error.message || error.code}`)),
    );
    ws.on('close', () => finish(new Error('connection closed')));
    ws.on('open', async () => {
      try {
        const frontier = await call('ledger.getFrontierMomentum', []);
        const frontierHeight = BigInt(frontier.height);
        let anchorHash: string | null = null;
        if (anchorHeight !== null && anchorHeight > 0n && frontierHeight >= anchorHeight) {
          const page = await call('ledger.getMomentumsByHeight', [Number(anchorHeight), 1]);
          anchorHash = page?.list?.[0]?.hash ?? null;
        }
        finish(null, { chainId: Number(frontier.chainIdentifier), frontierHeight, anchorHash });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

/**
 * Ranks probed nodes. A node is usable when it answered, is on the
 * configured chain, has reached the anchor with the same momentum hash, and
 * trails the most advanced usable node by at most MAX_NODE_LAG. Returns the
 * usable node indexes in priority order, and a reason for each rejected node.
 */
export function rankNodes(
  results: Array<NodeStatus | Error>,
  anchor: ChainAnchor | null,
  chainId: number,
): { usable: number[]; reasons: Array<string | null> } {
  const reasons: Array<string | null> = results.map((result) => {
    if (result instanceof Error) return result.message;
    if (result.chainId !== chainId) return `chain id ${result.chainId}, expected ${chainId}`;
    if (anchor && result.frontierHeight < anchor.height) {
      return `frontier ${result.frontierHeight} is below indexed height ${anchor.height}`;
    }
    if (anchor?.hash && result.anchorHash !== anchor.hash) {
      return `momentum ${anchor.height} has hash ${result.anchorHash}, indexed ${anchor.hash}`;
    }
    return null;
  });

  let best = -1n;
  results.forEach((result, i) => {
    if (reasons[i] === null && !(result instanceof Error) && result.frontierHeight > best) {
      best = result.frontierHeight;
    }
  });

  const usable: number[] = [];
  results.forEach((result, i) => {
    if (reasons[i] !== null || result instanceof Error) return;
    if (result.frontierHeight + MAX_NODE_LAG < best) {
      reasons[i] = `frontier ${result.frontierHeight} trails ${best}`;
      return;
    }
    usable.push(i);
  });

  return { usable, reasons };
}
