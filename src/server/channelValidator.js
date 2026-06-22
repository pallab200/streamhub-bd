import { MAX_CONCURRENCY, VALIDATE_TIMEOUT, MAX_REDIRECTS } from './config.js';

/**
 * Check if a URL looks like it could be an HLS stream.
 * Quickly rejects URLs that can't work (DASH, raw .ts, non-stream formats).
 * @param {string} streamUrl - The URL to check
 * @returns {boolean} Whether it's likely an HLS stream
 */
function isLikelyHLS(streamUrl) {
  const lower = streamUrl.toLowerCase();
  if (lower.includes('.m3u8')) return true;
  if (lower.includes('/hls/')) return true;
  if (lower.includes('/playlist')) return true;
  if (lower.includes('/index')) return true;
  if (lower.includes('/live/')) return true;
  if (lower.includes('/tracks-')) return true;
  // Reject non-HLS formats
  if (lower.endsWith('.mpd')) return false;
  if (lower.endsWith('.ts')) return false;
  if (lower.endsWith('.mp4') || lower.endsWith('.mkv')) return false;
  return true;
}

/**
 * Validates a single channel by fetching its stream URL and checking
 * if the response contains valid HLS manifest content.
 * This is more accurate than just checking HTTP status.
 *
 * @param {object} channel - Channel object with { name, logoUrl, streamUrl }
 * @param {object} options - Validation options
 * @param {number} options.timeoutMs - Timeout per request in ms
 * @param {number} options.maxRedirects - Maximum redirects to follow
 * @returns {Promise<boolean>} true if the channel has valid HLS content
 */
async function validateChannel(channel, { timeoutMs, maxRedirects }) {
  // Quick reject non-HLS URLs
  if (!isLikelyHLS(channel.streamUrl)) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(channel.streamUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      follow: maxRedirects,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      controller.abort();
      return false;
    }

    // Read first chunk to check for HLS content markers
    const text = await response.text();
    controller.abort();

    // Valid HLS manifests contain these markers
    if (text && (text.includes('#EXTM3U') || text.includes('#EXTINF') || text.includes('#EXT-X-'))) {
      return true;
    }

    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validates an array of channels concurrently using a worker pool.
 * Returns only the channels classified as working (valid HLS content).
 *
 * @param {Array<{name: string, logoUrl: string, streamUrl: string}>} channels
 * @param {object} [options]
 * @param {number} [options.concurrency] - Max simultaneous requests (default: 30)
 * @param {number} [options.timeoutMs] - Timeout per request in ms (default: 5000)
 * @param {number} [options.maxRedirects] - Max redirects to follow (default: 5)
 * @param {(validated: number, total: number) => void} [options.onProgress] - Progress callback
 * @returns {Promise<Array<{name: string, logoUrl: string, streamUrl: string}>>} Working channels
 */
export async function validateChannels(channels, options = {}) {
  const {
    concurrency = MAX_CONCURRENCY,
    timeoutMs = VALIDATE_TIMEOUT,
    maxRedirects = MAX_REDIRECTS,
    onProgress,
  } = options;

  if (!channels || channels.length === 0) {
    return [];
  }

  const total = channels.length;
  const workingChannels = [];
  let validated = 0;
  let index = 0;

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const channel = channels[currentIndex];

      const isWorking = await validateChannel(channel, { timeoutMs, maxRedirects });

      if (isWorking) {
        workingChannels.push(channel);
      }

      validated++;
      if (onProgress) {
        onProgress(validated, total);
      }
    }
  }

  // Launch workers up to the concurrency limit
  const workerCount = Math.min(concurrency, total);
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);

  return workingChannels;
}
