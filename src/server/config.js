// Configuration constants for the BDIX IPTV backend

/** Source URLs for the M3U playlists */
export const SOURCE_URLS = [
  'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u',
  'https://raw.githubusercontent.com/imShakil/tvlink/main/all.m3u',
  'https://iptv-org.github.io/iptv/index.m3u',
];

/** Legacy single URL (kept for backward compatibility) */
export const SOURCE_URL = SOURCE_URLS[0];

/** Timeout for fetching the playlist (ms) */
export const FETCH_TIMEOUT = 15000;

/** Timeout per channel validation request (ms) */
export const VALIDATE_TIMEOUT = 5000;

/** Maximum concurrent validation requests */
export const MAX_CONCURRENCY = 30;

/** Maximum redirects to follow during validation */
export const MAX_REDIRECTS = 5;

/** Default polling interval for re-fetching the playlist (ms) — 30 minutes */
export const UPDATE_INTERVAL = 30 * 60 * 1000;

/** Minimum allowed polling interval (ms) — 5 minutes */
export const MIN_INTERVAL = 5 * 60 * 1000;

/** Maximum allowed polling interval (ms) — 24 hours */
export const MAX_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * Clamps a numeric interval value to [MIN_INTERVAL, MAX_INTERVAL].
 * @param {number} value - The interval in milliseconds to clamp.
 * @returns {number} The clamped interval value.
 */
export function clampInterval(value) {
  if (value < MIN_INTERVAL) return MIN_INTERVAL;
  if (value > MAX_INTERVAL) return MAX_INTERVAL;
  return value;
}
