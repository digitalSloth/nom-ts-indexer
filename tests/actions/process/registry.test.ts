import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset modules before each test to get a fresh registry state
let registerHandler: typeof import('../../../src/actions/process/registry.js').registerHandler;
let getHandler: typeof import('../../../src/actions/process/registry.js').getHandler;
let warnMissingOnce: typeof import('../../../src/actions/process/registry.js').warnMissingOnce;
let keyFor: typeof import('../../../src/actions/process/registry.js').keyFor;

beforeEach(async () => {
  vi.resetModules();
  ({ registerHandler, getHandler, warnMissingOnce, keyFor } =
    await import('../../../src/actions/process/registry.js'));
});

describe('registry', () => {
  describe('keyFor', () => {
    it('joins contract and method with dot', () => {
      expect(keyFor('Pillar Contract', 'Register')).toBe('Pillar Contract.Register');
    });
  });

  describe('registerHandler / getHandler', () => {
    it('registers and retrieves a handler', () => {
      const handler = vi.fn();
      registerHandler('Pillar Contract', 'Register', handler);

      expect(getHandler('Pillar Contract', 'Register')).toBe(handler);
    });

    it('returns undefined for unregistered handler', () => {
      expect(getHandler('Unknown', 'Method')).toBeUndefined();
    });

    it('overwrites previously registered handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registerHandler('Contract', 'Method', handler1);
      registerHandler('Contract', 'Method', handler2);

      expect(getHandler('Contract', 'Method')).toBe(handler2);
    });

    it('keeps different contract/method pairs separate', () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      registerHandler('Contract', 'MethodA', handlerA);
      registerHandler('Contract', 'MethodB', handlerB);

      expect(getHandler('Contract', 'MethodA')).toBe(handlerA);
      expect(getHandler('Contract', 'MethodB')).toBe(handlerB);
    });
  });

  describe('warnMissingOnce', () => {
    it('logs a warning on first call', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      warnMissingOnce('Contract', 'Method');

      expect(warnSpy).toHaveBeenCalledWith('No action handler registered for Contract.Method');
    });

    it('does not log on subsequent calls for the same key', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      warnMissingOnce('Contract', 'Method');
      warnMissingOnce('Contract', 'Method');
      warnMissingOnce('Contract', 'Method');

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('logs separately for different keys', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      warnMissingOnce('Contract', 'MethodA');
      warnMissingOnce('Contract', 'MethodB');

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });
});
