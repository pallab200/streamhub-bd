/**
 * Server-side channel validation script.
 * Run this before deploying to pre-validate all channels.
 * Generates public/channels.json with working channels.
 *
 * Usage: node scripts/validate.js
 *
 * This runs on YOUR machine (BDIX network), so it can reach local streams.
 * The output JSON is deployed with Firebase Hosting for instant client load.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_URLS = [
  'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u',
  'https://raw.githubusercontent.com/imShakil/tvlink/main/all.m3u',
  'https://iptv-org.github.io/iptv/index.m3u',
];

const VALIDATE_TIMEOUT = 4000;
const MAX_CONCURRENCY = 80;

/**
 * Group normalization rules (same as client-side m3uParser.js)
 */
const GROUP_RULES = [
  { match: /fifa|world\s*cup|fwc|football|soccer/i, name: '⚽ FIFA World Cup 2026' },
  { match: /sport|cricket|ipl|bpl|t20|tennis|boxing|wrestling|ufc/i, name: '🏏 Sports' },
  { match: /^live\s*sport/i, name: '🏏 Sports' },
  { match: /bangla\s*news|bangladeshi\s*news/i, name: '📰 Bangla News' },
  { match: /bangla\s*movie|bangla\s*cinema/i, name: '🎬 Bangla Movies' },
  { match: /bangla\s*music|bengal.*beat/i, name: '🎵 Bangla Music' },
  { match: /kolkata|indian.?bangla/i, name: '🎭 Kolkata Bangla' },
  { match: /bangla|bangladeshi|bdix|bd\s/i, name: '📺 Bangla TV' },
  { match: /hindi\s*movie|bollywood|hindi\s*cinema|goldmine/i, name: '🎬 Hindi Movies' },
  { match: /hindi\s*music/i, name: '🎵 Hindi Music' },
  { match: /hindi|india(?!n.?bangla)/i, name: '📺 Hindi TV' },
  { match: /news|internasional/i, name: '📰 News' },
  { match: /movie|cinema|film/i, name: '🎬 Movies' },
  { match: /entertainment/i, name: '🎭 Entertainment' },
  { match: /kid|cartoon|child|animation|disney|nick|pogo/i, name: '🧸 Kids' },
  { match: /music|song/i, name: '🎵 Music' },
  { match: /islam|religi|quran|muslim|peace\s*tv|madani|makkah/i, name: '🕌 Religious' },
  { match: /document|discovery|nat\s*geo|animal|infotainment|history|science|travel|wild/i, name: '🌍 Documentary' },
  { match: /english/i, name: '🌐 International' },
];

function normalizeGroup(raw, channelName) {
  const combined = (raw || '') + ' ' + (channelName || '');
  for (const rule of GROUP_RULES) {
    if (rule.match.test(combined)) return rule.name;
  }
  return '📺 Other';
}

function isLikelyHLS(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8')) return true;
  if (lower.includes('/hls/')) return true;
  if (lower.includes('/playlist')) return true;
  if (lower.includes('/index')) return true;
  if (lower.includes('/live/')) return true;
  if (lower.includes('/tracks-')) return true;
  if (lower.endsWith('.mpd')) return false;
  if (lower.endsWith('.ts')) return false;
  if (lower.endsWith('.mp4') || lower.endsWith('.mkv')) return false;
  return true;
}

/**
 * Parse M3U content into channels
 */
function parseM3U(content) {
  const lines = content.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const channels = [];
  const seenUrls = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;

    const nameMatch = line.lastIndexOf(',');
    const name = nameMatch !== -1 ? line.substring(nameMatch + 1).trim() : '';
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const logo = (logoMatch && logoMatch[1]) || '';
    const groupMatch = line.match(/group-title="([^"]*)"/);
    const rawGroup = (groupMatch && groupMatch[1]) || '';

    // Find stream URL (next non-empty, non-comment line)
    let streamUrl = null;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();
      if (nextLine === '' || nextLine.startsWith('#EXTM3U')) continue;
      if (nextLine.startsWith('#EXTINF:')) break;
      if (nextLine.startsWith('#')) continue;
      streamUrl = nextLine;
      break;
    }

    if (streamUrl && !seenUrls.has(streamUrl)) {
      seenUrls.add(streamUrl);
      channels.push({
        name,
        logoUrl: logo,
        streamUrl,
        group: normalizeGroup(rawGroup, name),
      });
    }
  }

  return channels;
}

/**
 * Validate a single channel by fetching its manifest
 */
async function validateChannel(channel) {
  if (!isLikelyHLS(channel.streamUrl)) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT);

  try {
    const response = await fetch(channel.streamUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!response.ok) { controller.abort(); return false; }

    const text = await response.text();
    controller.abort();

    return text && (text.includes('#EXTM3U') || text.includes('#EXTINF') || text.includes('#EXT-X-'));
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate all channels with concurrency pool
 */
async function validateAll(channels) {
  const total = channels.length;
  const working = [];
  let validated = 0;
  let index = 0;

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const channel = channels[currentIndex];
      const isWorking = await validateChannel(channel);
      if (isWorking) working.push(channel);
      validated++;
      if (validated % 50 === 0 || validated === total) {
        process.stdout.write(`\r  Validated: ${validated}/${total} | Working: ${working.length}`);
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  console.log('');
  return working;
}

// Main
async function main() {
  console.log('🔄 Fetching playlists...');

  const results = await Promise.allSettled(
    SOURCE_URLS.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
  );

  const contents = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  if (contents.length === 0) {
    console.error('❌ Failed to fetch any playlists');
    process.exit(1);
  }

  console.log(`✅ Fetched ${contents.length} playlist(s)`);

  const combined = contents.join('\n');
  const channels = parseM3U(combined);
  console.log(`📋 Parsed ${channels.length} unique channels`);

  console.log('🔍 Validating channels (server-side HLS check)...');
  const working = await validateAll(channels);
  console.log(`✅ ${working.length} working channels found`);

  const outputPath = resolve(process.cwd(), 'public/channels.json');
  const output = {
    channels: working,
    total: channels.length,
    working: working.length,
    timestamp: Date.now(),
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(outputPath, JSON.stringify(output));
  console.log(`💾 Saved to ${outputPath}`);
  console.log(`📦 File size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
