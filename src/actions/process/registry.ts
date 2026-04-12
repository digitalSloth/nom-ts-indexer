import type { ActionHandler } from './types.js';

const handlers = new Map<string, ActionHandler>();
const warnedMissing = new Set<string>();

export function keyFor(contractName: string, methodName: string): string {
  return `${contractName}.${methodName}`;
}

export function registerHandler(
  contractName: string,
  methodName: string,
  handler: ActionHandler,
): void {
  handlers.set(keyFor(contractName, methodName), handler);
}

export function getHandler(contractName: string, methodName: string): ActionHandler | undefined {
  return handlers.get(keyFor(contractName, methodName));
}

export function warnMissingOnce(contractName: string, methodName: string): void {
  const key = keyFor(contractName, methodName);
  if (warnedMissing.has(key)) {
    return;
  }
  warnedMissing.add(key);
  console.warn(`No action handler registered for ${key}`);
}
