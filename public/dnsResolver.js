/**
 * Cloudflare 1.1.1.1 DNS-over-HTTPS Resolver
 * Resolves hostnames using Cloudflare's DNS resolver to bypass ISP DNS blocking.
 * https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/
 */

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/** In-memory DNS cache to avoid repeated lookups */
const dnsCache = new Map();

/** Cache TTL: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve a hostname to an IP address using Cloudflare 1.1.1.1 DoH.
 * @param {string} hostname - The hostname to resolve
 * @returns {Promise<string|null>} The resolved IP address or null if resolution fails
 */
export async function resolveHostname(hostname) {
  // Skip if it's already an IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return hostname;
  }

  // Check cache
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.ip;
  }

  try {
    const response = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: {
        'Accept': 'application/dns-json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data.Answer && data.Answer.length > 0) {
      // Find the first A record (type 1)
      const aRecord = data.Answer.find((r) => r.type === 1);
      if (aRecord && aRecord.data) {
        dnsCache.set(hostname, { ip: aRecord.data, timestamp: Date.now() });
        return aRecord.data;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a full URL's hostname using Cloudflare DoH and return a modified URL
 * with the IP address (adding Host header info for reference).
 * @param {string} originalUrl - The original stream URL
 * @returns {Promise<{url: string, hostname: string, ip: string}|null>} Resolved URL info or null
 */
export async function resolveUrl(originalUrl) {
  try {
    const urlObj = new URL(originalUrl);
    const hostname = urlObj.hostname;

    // Already an IP — no need to resolve
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return null;
    }

    const ip = await resolveHostname(hostname);
    if (!ip) return null;

    // Return the resolved IP-based URL
    const resolvedUrl = originalUrl.replace(hostname, ip);
    return { url: resolvedUrl, hostname, ip };
  } catch {
    return null;
  }
}

/**
 * Clear the DNS cache.
 */
export function clearDnsCache() {
  dnsCache.clear();
}
