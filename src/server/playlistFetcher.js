// Playlist fetcher module — retrieves M3U content from multiple source URLs

import { SOURCE_URLS, SOURCE_URL, FETCH_TIMEOUT } from './config.js';

/**
 * Appends a cache-busting query parameter to a URL.
 * @param {string} url - The base URL to append the parameter to.
 * @returns {string} The URL with the cache-busting parameter appended.
 */
export function appendCacheBuster(url) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}

/**
 * Fetches a single M3U playlist from the given URL.
 * @param {string} sourceUrl - The URL to fetch the playlist from.
 * @param {number} [timeoutMs=FETCH_TIMEOUT] - Request timeout in milliseconds.
 * @returns {Promise<{success: boolean, content: string|null, error: string|null}>}
 */
async function fetchSinglePlaylist(sourceUrl, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = appendCacheBuster(sourceUrl);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'StreamHub-BD/1.0' },
    });

    if (!response.ok) {
      return {
        success: false,
        content: null,
        error: `HTTP error: ${response.status} ${response.statusText}`,
      };
    }

    const content = await response.text();

    // Verify it's M3U content
    if (!content || (!content.includes('#EXTM3U') && !content.includes('#EXTINF'))) {
      return {
        success: false,
        content: null,
        error: 'Response is not valid M3U content',
      };
    }

    return { success: true, content, error: null };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, content: null, error: 'Request timed out' };
    }
    return { success: false, content: null, error: err.message || 'Network error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches all M3U playlists from configured sources and combines them.
 * @param {string[]} [urls=SOURCE_URLS] - Array of playlist URLs to fetch.
 * @param {number} [timeoutMs=FETCH_TIMEOUT] - Request timeout in milliseconds.
 * @returns {Promise<{success: boolean, content: string|null, error: string|null}>}
 */
export async function fetchPlaylist(urls = SOURCE_URLS, timeoutMs = FETCH_TIMEOUT) {
  // Handle legacy single-URL call
  if (typeof urls === 'string') {
    return fetchSinglePlaylist(urls, timeoutMs);
  }

  const results = await Promise.allSettled(
    urls.map((url) => fetchSinglePlaylist(url, timeoutMs))
  );

  const contents = results
    .filter((r) => r.status === 'fulfilled' && r.value.success)
    .map((r) => r.value.content);

  if (contents.length === 0) {
    const errors = results
      .filter((r) => r.status === 'fulfilled' && !r.value.success)
      .map((r) => r.value.error);
    return {
      success: false,
      content: null,
      error: `All fetches failed: ${errors.join('; ')}`,
    };
  }

  return {
    success: true,
    content: contents.join('\n'),
    error: null,
  };
}
