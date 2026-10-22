import { describe, expect, it, vi } from 'vitest';
import { isTransientBrowserError, retryOnce } from './retry.mjs';

describe('retryOnce', () => {
  it('recognises the cold-server and Vite-reload failures only', () => {
    expect(isTransientBrowserError(new Error('Navigation timeout of 30000 ms exceeded'))).toBe(true);
    expect(isTransientBrowserError(new Error('Execution context was destroyed, most likely because of a navigation.'))).toBe(true);
    expect(isTransientBrowserError(new Error('TypeError: x is not a function'))).toBe(false);
  });

  it('retries a transient failure once and logs it', async () => {
    const log = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('Execution context was destroyed')).mockResolvedValueOnce('ok');
    await expect(retryOnce(fn, 'visit x', log)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('gives up after the second transient failure and never retries other errors', async () => {
    const twice = vi.fn().mockRejectedValue(new Error('Navigation timeout of 90000 ms exceeded'));
    await expect(retryOnce(twice, 'x', () => {})).rejects.toThrow(/Navigation timeout/);
    expect(twice).toHaveBeenCalledTimes(2);
    const other = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retryOnce(other, 'x', () => {})).rejects.toThrow('boom');
    expect(other).toHaveBeenCalledTimes(1);
  });
});
