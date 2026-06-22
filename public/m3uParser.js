/**
 * M3U Parser Module (Browser ES Module)
 * Parses raw M3U playlist content into structured channel objects.
 */

/**
 * Parses raw M3U content into an array of channel objects.
 * @param {string} content - Raw M3U playlist text
 * @returns {{ name: string, logoUrl: string, streamUrl: string, group: string }[]} Array of parsed channel objects
 */
export function parseM3U(content) {
  if (!content || typeof content !== 'string') {
    console.warn('M3U Parser: Invalid input - content is empty or not a string');
    return [];
  }

  // Strip UTF-8 BOM if present, then trim whitespace
  const trimmed = content.replace(/^\uFEFF/, '').trim();

  // Skip leading comment lines (lines starting with # that are not #EXTM3U or #EXTINF)
  const lines = trimmed.split(/\r?\n/);
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTM3U')) {
      headerIndex = i;
      break;
    }
    // Allow blank lines and comment lines before the header
    if (line === '' || (line.startsWith('#') && !line.startsWith('#EXTINF'))) {
      continue;
    }
    // Non-comment, non-blank line before #EXTM3U means invalid format
    break;
  }

  if (headerIndex === -1) {
    console.warn('M3U Parser: Invalid format - content does not start with #EXTM3U header');
    return [];
  }

  const channels = [];
  const seenUrls = new Set();

  let i = headerIndex + 1;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip additional #EXTM3U headers (from concatenated playlists)
    if (line.startsWith('#EXTM3U')) {
      i++;
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const name = extractChannelName(line);
      const logoUrl = extractLogoUrl(line);
      const group = extractGroup(line);
      const streamUrl = findStreamUrl(lines, i + 1);

      if (streamUrl && !seenUrls.has(streamUrl)) {
        seenUrls.add(streamUrl);
        channels.push({ name, logoUrl, streamUrl, group });
        i = findStreamUrlIndex(lines, i + 1) + 1;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  if (channels.length === 0) {
    console.warn('M3U Parser: No valid channel entries found in content');
    return [];
  }

  return channels;
}

/**
 * Group normalization map — maps raw group-title keywords to clean category names.
 * Order matters: first match wins.
 */
const GROUP_RULES = [
  // FIFA World Cup 2026 — top priority, catches all football/world cup related
  { match: /fifa|world\s*cup|fwc/i, name: '⚽ FIFA World Cup 2026' },
  { match: /football|soccer/i, name: '⚽ FIFA World Cup 2026' },

  // Sports
  { match: /sport|cricket|ipl|bpl|t20|tennis|boxing|wrestling|ufc/i, name: '🏏 Sports' },
  { match: /^live\s*sport/i, name: '🏏 Sports' },

  // Bangla (BD channels)
  { match: /bangla\s*news|bangladeshi\s*news/i, name: '📰 Bangla News' },
  { match: /bangla\s*movie|bangla\s*cinema/i, name: '🎬 Bangla Movies' },
  { match: /bangla\s*music|bengal.*beat/i, name: '🎵 Bangla Music' },
  { match: /kolkata|indian.?bangla/i, name: '🎭 Kolkata Bangla' },
  { match: /bangla|bangladeshi|bdix|bd\s/i, name: '📺 Bangla TV' },

  // Hindi/Indian
  { match: /hindi\s*movie|bollywood|hindi\s*cinema/i, name: '🎬 Hindi Movies' },
  { match: /hindi\s*music/i, name: '🎵 Hindi Music' },
  { match: /hindi|india(?!n.?bangla)/i, name: '📺 Hindi TV' },
  { match: /goldmine/i, name: '🎬 Hindi Movies' },

  // News
  { match: /news|internasional/i, name: '📰 News' },

  // Movies & Entertainment
  { match: /movie|cinema|film/i, name: '🎬 Movies' },
  { match: /entertainment/i, name: '🎭 Entertainment' },

  // Kids & Cartoon
  { match: /kid|cartoon|child|animation|disney|nick|pogo/i, name: '🧸 Kids' },

  // Music
  { match: /music|song/i, name: '🎵 Music' },

  // Religion/Islamic
  { match: /islam|religi|quran|muslim|peace\s*tv|madani|makkah/i, name: '🕌 Religious' },

  // Documentary/Infotainment
  { match: /document|discovery|nat\s*geo|animal|infotainment|history|science|travel|wild/i, name: '🌍 Documentary' },

  // English/International
  { match: /english/i, name: '🌐 International' },
];

/**
 * Extracts and normalizes the group-title attribute value from an #EXTINF line.
 * Maps raw groups into clean, organized categories.
 * @param {string} extinfLine - The #EXTINF directive line
 * @returns {string} The normalized group name
 */
function extractGroup(extinfLine) {
  const match = extinfLine.match(/group-title="([^"]*)"/);
  const raw = (match && match[1] && match[1].trim()) ? match[1].trim() : '';

  if (!raw) return '📺 Other';

  // Also check channel name for better categorization
  const channelName = extractChannelName(extinfLine);
  const combined = raw + ' ' + channelName;

  for (const rule of GROUP_RULES) {
    if (rule.match.test(combined)) {
      return rule.name;
    }
  }

  return '📺 Other';
}

/**
 * Extracts the channel name from an #EXTINF line.
 * @param {string} extinfLine - The #EXTINF directive line
 * @returns {string} The channel name
 */
function extractChannelName(extinfLine) {
  const lastCommaIndex = extinfLine.lastIndexOf(',');
  if (lastCommaIndex === -1) {
    return '';
  }
  return extinfLine.substring(lastCommaIndex + 1).trim();
}

/**
 * Extracts the tvg-logo attribute value from an #EXTINF line.
 * @param {string} extinfLine - The #EXTINF directive line
 * @returns {string} The logo URL or empty string
 */
function extractLogoUrl(extinfLine) {
  const logoMatch = extinfLine.match(/tvg-logo="([^"]*)"/);
  if (logoMatch && logoMatch[1]) return logoMatch[1];

  const tvgoMatch = extinfLine.match(/tvgo="([^"]*)"/);
  if (tvgoMatch && tvgoMatch[1]) return tvgoMatch[1];

  const plainLogoMatch = extinfLine.match(/\blogo="([^"]*)"/);
  if (plainLogoMatch && plainLogoMatch[1]) return plainLogoMatch[1];

  return '';
}

/**
 * Finds the next non-empty, non-comment line starting from a given index.
 * @param {string[]} lines - Array of all lines
 * @param {number} startIndex - Index to start searching from
 * @returns {string|null} The stream URL or null if not found
 */
function findStreamUrl(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line.startsWith('#EXTINF:')) return null;
    if (line.startsWith('#')) continue;
    return line;
  }
  return null;
}

/**
 * Finds the index of the next non-empty, non-comment line starting from a given index.
 * @param {string[]} lines - Array of all lines
 * @param {number} startIndex - Index to start searching from
 * @returns {number} The index of the stream URL line
 */
function findStreamUrlIndex(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line.startsWith('#EXTINF:')) return i - 1;
    if (line.startsWith('#')) continue;
    return i;
  }
  return startIndex;
}
