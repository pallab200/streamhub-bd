import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPlaylist, appendCacheBuster } from '../src/server/playlistFetcher.js';

describe('appendCacheBuster', () => {
  it('appends _t parameter with ? for URLs without query string', () => {
    const url = appendCacheBuster('https://example.com/playlist.m3u');
    expect(url).toMatch(/^https:\/\/example\.com\/playlist\.m3u\?_t=\d+$/);
  });

  it('appends _t parameter with & for URLs with existing query string', () => {
    const url = appendCacheBuster('https://example.com/playlist.m3u?foo=bar');
    expect(url).toMatch(/^https:\/\/example\.com\/playlist\.m3u\?foo=bar&_t=\d+$/);
  });

  it('uses Date.now() for the timestamp value', () => {
    const before = Date.now();
    const url = appendCacheBuster('https://example.com/file');
    const after = Date.now();
    const match = url.match(/_t=(\d+)/);
    expect(match).not.toBeNull();
    const timestamp = Number(match[1]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe('fetchPlaylist', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns success with content on HTTP 200', async () => {
    const m3uContent = '#EXTM3U\n#EXTINF:-1,Channel 1\nhttp://stream.test/1';
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(m3uContent),
    });

    const result = await fetchPlaylist('https://example.com/playlist.m3u');

    expect(result).toEqual({
      success: true,
      content: m3uContent,
      error: null,
    });
  });

  it('appends cache-busting parameter to the request URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
    });

    await fetchPlaylist('https://example.com/playlist.m3u');

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/\?_t=\d+$/);
  });

  it('returns error for HTTP 404', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await fetchPlaylist('https://example.com/missing.m3u');

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'HTTP error: 404 Not Found',
    });
  });

  it('returns error for HTTP 500', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await fetchPlaylist('https://example.com/error.m3u');

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'HTTP error: 500 Internal Server Error',
    });
  });

  it('returns error on network failure', async () => {
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await fetchPlaylist('https://example.com/playlist.m3u');

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'fetch failed',
    });
  });

  it('returns error on DNS resolution failure', async () => {
    fetch.mockRejectedValueOnce(new TypeError('getaddrinfo ENOTFOUND example.com'));

    const result = await fetchPlaylist('https://example.com/playlist.m3u');

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'getaddrinfo ENOTFOUND example.com',
    });
  });

  it('returns timeout error when request exceeds timeout', async () => {
    fetch.mockImplementationOnce((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const result = await fetchPlaylist('https://example.com/playlist.m3u', 50);

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'Request timed out',
    });
  });

  it('passes AbortController signal to fetch', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
    });

    await fetchPlaylist('https://example.com/playlist.m3u');

    const options = fetch.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses default SOURCE_URL when no sourceUrl provided', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
    });

    await fetchPlaylist();

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain('raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV');
  });
});
