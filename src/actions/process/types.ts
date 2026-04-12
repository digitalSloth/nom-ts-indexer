import type { Knex } from 'knex';
import type { AccountBlock } from 'znn-typescript-sdk';

export type KnexTransactionClient = Knex.Transaction;

export interface ActionContext {
  tx: KnexTransactionClient;
  receiveBlock: {
    id: number;
    momentumId: number;
    createdAt: Date;
  };
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
