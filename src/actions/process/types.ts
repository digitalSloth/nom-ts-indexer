import type { Knex } from 'knex';

export type KnexTransactionClient = Knex.Transaction;

export interface FrontierMomentum {
  height: bigint;
  timestamp: Date;
}

export interface ActionContext {
  tx: KnexTransactionClient;
  receiveBlock: {
    id: number;
    momentumId: number;
    createdAt: Date;
  };
  /**
   * The momentum the contract read as its frontier while running the call:
   * the receive block's acknowledged momentum. Contract rules that use the
   * current height or time (expiries, delays, enforcement heights) use it.
   */
  frontierMomentum: FrontierMomentum;
  sendBlock: {
    id: number;
    accountId: number;
    toAccountId: number;
    tokenId: number | null;
    amount: string;
    hash: string;
    createdAt: Date;
  };
  decoded: Record<string, any>;
}

export type ActionHandler = (ctx: ActionContext) => Promise<void>;
