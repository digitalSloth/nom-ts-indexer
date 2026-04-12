export type WebhookEventType = 'momentum.inserted' | 'account_block.inserted';

export interface MomentumInsertedPayload {
  height: string;
  hash: string;
  timestamp: number;
}

export interface AccountBlockInsertedPayload {
  momentumHeight: string;
  hash: string;
  address: string;
  toAddress: string;
  blockType: number;
}

export interface WebhookEvent<T = unknown> {
  event: WebhookEventType;
  timestamp: string;
  data: T;
}

export interface WebhookSubscription {
  url: string;
  events: WebhookEventType[];
  secret?: string;
}
