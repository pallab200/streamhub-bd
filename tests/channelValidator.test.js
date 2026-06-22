import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateChannels } from '../src/server/channelValidator.js';

describe('channelValidator', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeChannel(name, streamUrl = `http://stream.test/${name}`) {
    return { name, logoUrl: '', streamUrl };
  }

  it('returns empty array for empty input', async () => {
    const result = await validateChannels([]);
    expect(result).toEqual([]);
  });

  it('returns empty array for null/undefined input', async () => {
    const result = await validateChannels(null);
    expect(result).toEqual([]);
  });

  it('classifies 200 response as working', async () => {
    const channel = makeChannel('TestChannel');
    fetch.mockResolvedValueOnce({ status: 200 });

    const result = await validateChannels([channel]);
    expect(result).toEqual([channel]);
  });

  it('classifies other 2xx responses as working', async () => {
    const channels = [makeChannel('ch1'), makeChannel('ch2')];
    fetch.mockResolvedValueOnce({ status: 204 });
    fetch.mockResolvedValueOnce({ status: 206 });

    const result = await validateChannels(channels);
    expect(result).toHaveLength(2);
  });

  it('classifies 4xx responses as non-working', async () => {
    const channel = makeChannel('NotFound');
    fetch.mockResolvedValueOnce({ status: 404 });

    const result = await validateChannels([channel]);
    expect(result).toEqual([]);
  });

  it('classifies 5xx responses as non-working', async () => {
    const channel = makeChannel('ServerError');
    fetch.mockResolvedValueOnce({ status: 500 });

    const result = await validateChannels([channel]);
    expect(result).toEqual([]);
  });

  it('classifies network errors as non-working', async () => {
    const channel = makeChannel('NetworkFail');
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await validateChannels([channel]);
    expect(result).toEqual([]);
  });

  it('classifies timeout (abort) as non-working', async () => {
    const channel = makeChannel('Timeout');
    fetch.mockImplementationOnce((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const result = await validateChannels([channel], { timeoutMs: 50 });
    expect(result).toEqual([]);
  });

  it('issues GET requests (not HEAD, as IPTV streams often reject HEAD)', async () => {
    const channel = makeChannel('GetTest');
    fetch.mockResolvedValueOnce({ status: 200 });

    await validateChannels([channel]);

    expect(fetch).toHaveBeenCalledWith(
      channel.streamUrl,
      expect.objectContaining({ method: 'GET', redirect: 'follow' })
    );
  });

  it('calls onProgress callback for each channel', async () => {
    const channels = [makeChannel('a'), makeChannel('b'), makeChannel('c')];
    fetch.mockResolvedValue({ status: 200 });

    const onProgress = vi.fn();
    await validateChannels(channels, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    expect(onProgress).toHaveBeenCalledWith(2, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it('respects concurrency limit', async () => {
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;

    const channels = Array.from({ length: 10 }, (_, i) => makeChannel(`ch${i}`));

    fetch.mockImplementation(() => {
      activeConcurrency++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrency);
      return new Promise((resolve) => {
        setTimeout(() => {
          activeConcurrency--;
          resolve({ status: 200 });
        }, 10);
      });
    });

    await validateChannels(channels, { concurrency: 3 });

    expect(maxObservedConcurrency).toBeLessThanOrEqual(3);
  });

  it('returns only working channels from mixed results', async () => {
    const channels = [
      makeChannel('working1'),
      makeChannel('broken1'),
      makeChannel('working2'),
      makeChannel('broken2'),
    ];

    fetch
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 500 });

    const result = await validateChannels(channels, { concurrency: 1 });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('working1');
    expect(result[1].name).toBe('working2');
  });
});
