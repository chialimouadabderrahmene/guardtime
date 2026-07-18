'use strict';

const { retry } = require('../src/retry');

describe('retry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retry(fn, { attempts: 3, delayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds within the attempt budget', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');
    const onRetry = jest.fn();
    const result = await retry(fn, { attempts: 3, delayMs: 1, onRetry });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting all attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent'));
    await expect(retry(fn, { attempts: 3, delayMs: 1 })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('defaults to 3 attempts when not specified', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('x'));
    await expect(retry(fn, { delayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
