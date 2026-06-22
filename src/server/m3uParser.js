/**
 * M3U Parser Module
 * Parses raw M3U playlist content into structured channel objects.
 */

/**
 * Parses raw M3U content into an array of channel objects.
 * @param {string} content - Raw M3U playlist text
 * @returns {{ name: string, logoUrl: string, streamUrl: string }[]} Array of parsed channel objects
 */
export function parseM3U(content) {
  if (!content || typeof content !== 'string') {
    console.warn('M3U Parser: Invalid input - content is empty or not a string');
    return [];
  }

  // Strip UTF-8 BOM if present, then trim whitespace
  const trimmed = content.replace(/^\uFEFF/, '').trim();

  // Skip leading comment lines (lines starting with # that are not #EXTM3U or #EXTINF)
  // This handles playlists that have informational comment blocks before the header
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

  let i = headerIndex + 1; // Skip to the line after #EXTM3U header
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      // Extract channel name (text after last comma)
      const name = extractChannelName(line);

      // Extract tvg-logo attribute
      const logoUrl = extractLogoUrl(line);

      // Find the next non-empty, non-comment line as stream URL
      const streamUrl = findStreamUrl(lines, i + 1);

      if (streamUrl) {
        channels.push({ name, logoUrl, streamUrl });
        // Skip to the line after the stream URL
        i = findStreamUrlIndex(lines, i + 1) + 1;
      } else {
        // Skip this entry - no valid stream URL
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
 * Extracts the channel name from an #EXTINF line.
 * The name is the text after the last comma on the line.
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
 * Returns empty string if the attribute is not present.
 * @param {string} extinfLine - The #EXTINF directive line
 * @returns {string} The logo URL or empty string
 */
function extractLogoUrl(extinfLine) {
  // Try tvg-logo first (most common)
  const logoMatch = extinfLine.match(/tvg-logo="([^"]*)"/);
  if (logoMatch && logoMatch[1]) return logoMatch[1];

  // Try tvgo attribute (used in some BDIX playlists)
  const tvgoMatch = extinfLine.match(/tvgo="([^"]*)"/);
  if (tvgoMatch && tvgoMatch[1]) return tvgoMatch[1];

  // Try logo attribute (some playlists use this)
  const plainLogoMatch = extinfLine.match(/\blogo="([^"]*)"/);
  if (plainLogoMatch && plainLogoMatch[1]) return plainLogoMatch[1];

  return '';
}

/**
 * Finds the next non-empty, non-comment line starting from a given index.
 * Stops searching if another #EXTINF directive is encountered.
 * @param {string[]} lines - Array of all lines
 * @param {number} startIndex - Index to start searching from
 * @returns {string|null} The stream URL or null if not found
 */
function findStreamUrl(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    // Stop if we hit another #EXTINF directive - this means current entry has no stream URL
    if (line.startsWith('#EXTINF:')) return null;
    // Skip other comment lines
    if (line.startsWith('#')) continue;
    return line;
  }
  return null;
}

/**
 * Finds the index of the next non-empty, non-comment line starting from a given index.
 * @param {string[]} lines - Array of all lines
 * @param {number} startIndex - Index to start searching from
 * @returns {number} The index of the stream URL line, or startIndex if not found
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
