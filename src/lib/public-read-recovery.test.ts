import { describe, expect, it, vi } from 'vitest';
import { recoverPublicRead } from './public-read-recovery';

describe('public read transport recovery', () => {
  it('retries a failed fetch once and returns real data', async () => {
    const read = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({slug:'dede-fk-zayv'});
    expect(await recoverPublicRead(read)).toEqual({slug:'dede-fk-zayv'});
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not loop while offline', async () => {
    const read=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(recoverPublicRead(read)).rejects.toThrow('Failed to fetch');
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not retry authorization or application errors', async () => {
    const read=vi.fn().mockRejectedValue(new Error('Forbidden'));
    await expect(recoverPublicRead(read)).rejects.toThrow('Forbidden');
    expect(read).toHaveBeenCalledTimes(1);
  });
});