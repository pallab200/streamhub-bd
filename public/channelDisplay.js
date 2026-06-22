/**
 * Channel Display Module (Static/Client-Side Version)
 * Renders working channels and manages UI state (loading, progress, errors).
 */

/**
 * Truncate a channel name to 50 characters with ellipsis if longer.
 * @param {string} name - The channel name to truncate.
 * @returns {string} The truncated name or original if ≤50 chars.
 */
export function truncateName(name) {
  if (name.length > 50) {
    return name.slice(0, 50) + '\u2026';
  }
  return name;
}

/**
 * Format progress text for validation display.
 * @param {number} validated - Number of channels validated so far.
 * @param {number} total - Total number of channels to validate.
 * @returns {string} Formatted progress string.
 */
export function formatProgress(validated, total) {
  return `${validated} of ${total} channels validated`;
}

/**
 * Generate a consistent color from a channel name using a hash.
 * @param {string} name - The channel name.
 * @returns {string} HSL color string.
 */
export function getChannelColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

/**
 * Get DOM element references.
 * @returns {object} Object containing all relevant DOM element references.
 */
function getElements() {
  return {
    channelGrid: document.getElementById('channel-grid'),
    loadingArea: document.getElementById('loading-area'),
    progressArea: document.getElementById('progress-area'),
    progressText: document.getElementById('progress-text'),
    progressBar: document.getElementById('progress-bar'),
    errorArea: document.getElementById('error-area'),
    errorMessage: document.getElementById('error-message'),
    retryButton: document.getElementById('retry-button'),
    statusArea: document.getElementById('status-area'),
    statusText: document.getElementById('status-text'),
  };
}

/**
 * Hide all state areas (loading, progress, error, status).
 */
function hideAllAreas() {
  const { loadingArea, progressArea, errorArea, statusArea } = getElements();
  if (loadingArea) loadingArea.classList.add('hidden');
  if (progressArea) progressArea.classList.add('hidden');
  if (errorArea) errorArea.classList.add('hidden');
  if (statusArea) statusArea.classList.add('hidden');
}

/**
 * Create initials from a channel name for use as placeholder text.
 * @param {string} name - The channel name.
 * @returns {string} Initials (up to 2 characters).
 */
function getInitials(name) {
  const prefixes = ['HD ', 'SD ', 'FHD ', '4K '];
  let cleaned = name.trim();
  for (const prefix of prefixes) {
    if (cleaned.toUpperCase().startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
      break;
    }
  }
  if (!cleaned) cleaned = name.trim();
  const words = cleaned.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

let hlsInstance = null;

/**
 * Play a channel stream in the video player overlay.
 * @param {string} name - Channel name to display
 * @param {string} streamUrl - HLS stream URL to play
 */
export function playChannel(name, streamUrl) {
  const overlay = document.getElementById('player-overlay');
  const video = document.getElementById('video-player');
  const channelName = document.getElementById('player-channel-name');
  const closeBtn = document.getElementById('player-close');

  if (!overlay || !video) return;

  overlay.classList.remove('hidden');
  if (channelName) channelName.textContent = name;

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (window.Hls && window.Hls.isSupported()) {
    hlsInstance = new window.Hls();
    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(video);
    hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
      const playPromise = video.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    });
    hlsInstance.on(window.Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('HLS fatal error:', data.type);
        hlsInstance.destroy();
        hlsInstance = null;
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl;
    const playPromise = video.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
  } else {
    video.src = streamUrl;
    const playPromise = video.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
  }

  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.replaceWith(newCloseBtn);
    newCloseBtn.addEventListener('click', closePlayer);
  }

  document.addEventListener('keydown', handleEscapeKey);
  overlay.addEventListener('click', handleOverlayClick);
}

function closePlayer() {
  const overlay = document.getElementById('player-overlay');
  const video = document.getElementById('video-player');

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  if (overlay) {
    overlay.classList.add('hidden');
  }

  document.removeEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    closePlayer();
  }
}

function handleOverlayClick(e) {
  if (e.target.id === 'player-overlay') {
    closePlayer();
  }
}

/**
 * Create a placeholder element with gradient background based on channel name.
 * @param {object} channel - Channel object with name property.
 * @returns {HTMLElement} The placeholder element.
 */
function createPlaceholder(channel) {
  const placeholder = document.createElement('div');
  placeholder.className = 'channel-logo-placeholder';
  placeholder.textContent = getInitials(channel.name);
  placeholder.setAttribute('aria-label', `${channel.name} logo placeholder`);
  const color1 = getChannelColor(channel.name);
  const color2 = getChannelColor(channel.name + 'x');
  placeholder.style.background = `linear-gradient(135deg, ${color1}, ${color2})`;
  return placeholder;
}

/**
 * Create a channel card element.
 * Loads logos directly (no proxy) with referrerPolicy='no-referrer'.
 * On error, immediately falls back to placeholder.
 * @param {object} channel - Channel object with name, logoUrl, streamUrl.
 * @returns {HTMLElement} The channel card element.
 */
function createChannelCard(channel) {
  const card = document.createElement('div');
  card.className = 'channel-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.dataset.streamUrl = channel.streamUrl;
  card.dataset.channelName = channel.name;

  card.addEventListener('click', () => {
    playChannel(channel.name, channel.streamUrl);
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      playChannel(channel.name, channel.streamUrl);
    }
  });

  const displayName = truncateName(channel.name);

  if (channel.logoUrl) {
    const img = document.createElement('img');
    img.className = 'channel-logo';
    img.src = channel.logoUrl;
    img.alt = `${channel.name} logo`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';

    img.onerror = function () {
      // Single attempt — no proxy retry, just show placeholder
      const placeholder = createPlaceholder(channel);
      img.replaceWith(placeholder);
    };

    card.appendChild(img);
  } else {
    const placeholder = createPlaceholder(channel);
    card.appendChild(placeholder);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'channel-name';
  nameEl.textContent = displayName;
  nameEl.title = channel.name;
  card.appendChild(nameEl);

  return card;
}

/**
 * Render channel cards in the channel grid.
 * Sorts channels alphabetically by name and applies any active search/category filter.
 * @param {Array<{name: string, logoUrl: string, streamUrl: string, group: string}>} channels
 */
export function renderChannels(channels) {
  const { channelGrid } = getElements();
  if (!channelGrid) return;

  hideAllAreas();

  const sorted = [...channels].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  window.__streamhub_channels = sorted;

  // Build category list
  buildCategoryFilter(sorted);

  // Apply current filters
  const filtered = applyFilters(sorted);
  renderFilteredChannels(filtered);

  const searchArea = document.getElementById('search-area');
  if (searchArea) searchArea.classList.remove('hidden');

  updateChannelCount(filtered.length, sorted.length);
}

/**
 * Preferred category order — FIFA World Cup first, then by importance.
 */
const CATEGORY_ORDER = [
  '⚽ FIFA World Cup 2026',
  '🏏 Sports',
  '📺 Bangla TV',
  '📰 Bangla News',
  '🎬 Bangla Movies',
  '🎵 Bangla Music',
  '🎭 Kolkata Bangla',
  '📺 Hindi TV',
  '🎬 Hindi Movies',
  '🎵 Hindi Music',
  '📰 News',
  '🎬 Movies',
  '🎭 Entertainment',
  '🧸 Kids',
  '🎵 Music',
  '🕌 Religious',
  '🌍 Documentary',
  '🌐 International',
  '📺 Other',
];

/**
 * Build category filter buttons from channel groups.
 * FIFA World Cup 2026 is always shown first.
 * @param {Array} channels - All channels
 */
function buildCategoryFilter(channels) {
  const container = document.getElementById('category-filter');
  if (!container) return;

  const groups = new Map();
  for (const ch of channels) {
    const group = ch.group || '📺 Other';
    groups.set(group, (groups.get(group) || 0) + 1);
  }

  // Sort groups by preferred order, then alphabetically for unlisted ones
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a[0]);
    const indexB = CATEGORY_ORDER.indexOf(b[0]);
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    if (orderA !== orderB) return orderA - orderB;
    return a[0].localeCompare(b[0]);
  });

  container.innerHTML = '';

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'category-btn active';
  allBtn.textContent = `All (${channels.length})`;
  allBtn.dataset.category = '__all__';
  allBtn.setAttribute('role', 'tab');
  allBtn.setAttribute('aria-selected', 'true');
  allBtn.addEventListener('click', () => selectCategory('__all__'));
  container.appendChild(allBtn);

  for (const [group, count] of sortedGroups) {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = `${group} (${count})`;
    btn.dataset.category = group;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.addEventListener('click', () => selectCategory(group));
    container.appendChild(btn);
  }
}

/** Currently selected category */
let currentCategory = '__all__';

/**
 * Select a category and re-filter channels.
 * @param {string} category - The category to filter by
 */
function selectCategory(category) {
  currentCategory = category;

  // Update button active states
  const buttons = document.querySelectorAll('.category-btn');
  for (const btn of buttons) {
    const isActive = btn.dataset.category === category;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }

  filterChannels();
}

/**
 * Apply search and category filters.
 * @param {Array} channels - All channels
 * @returns {Array} Filtered channels
 */
function applyFilters(channels) {
  const searchInput = document.getElementById('search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filtered = channels;

  // Apply category filter
  if (currentCategory !== '__all__') {
    filtered = filtered.filter(ch => (ch.group || 'Other') === currentCategory);
  }

  // Apply search filter
  if (query) {
    filtered = filtered.filter(ch => ch.name.toLowerCase().includes(query));
  }

  return filtered;
}

/**
 * Render a filtered list of channels into the grid.
 * @param {Array<{name: string, logoUrl: string, streamUrl: string}>} channels
 */
function renderFilteredChannels(channels) {
  const { channelGrid } = getElements();
  if (!channelGrid) return;

  channelGrid.innerHTML = '';

  if (channels.length === 0) {
    const noResult = document.createElement('p');
    noResult.className = 'no-results';
    noResult.textContent = 'No channels match your search.';
    channelGrid.appendChild(noResult);
    return;
  }

  for (const channel of channels) {
    const card = createChannelCard(channel);
    channelGrid.appendChild(card);
  }
}

/**
 * Update the channel count display.
 * @param {number} showing - Number of channels currently shown.
 * @param {number} total - Total number of working channels.
 */
function updateChannelCount(showing, total) {
  const countEl = document.getElementById('channel-count');
  if (!countEl) return;
  if (showing === total) {
    countEl.textContent = `${total} channels`;
  } else {
    countEl.textContent = `${showing} of ${total} channels`;
  }
}

/**
 * Filter channels based on search input and selected category.
 */
export function filterChannels() {
  const channels = window.__streamhub_channels || [];
  const filtered = applyFilters(channels);

  renderFilteredChannels(filtered);
  updateChannelCount(filtered.length, channels.length);
}

/**
 * Show the loading indicator.
 */
export function showLoading() {
  const { loadingArea, channelGrid } = getElements();
  hideAllAreas();

  if (channelGrid) channelGrid.innerHTML = '';
  if (loadingArea) loadingArea.classList.remove('hidden');
}

/**
 * Show validation progress.
 * @param {number} validated - Number of channels validated so far.
 * @param {number} total - Total number of channels to validate.
 */
export function showProgress(validated, total) {
  const { loadingArea, progressArea, progressText, progressBar } = getElements();

  if (loadingArea) loadingArea.classList.add('hidden');
  if (progressArea) progressArea.classList.remove('hidden');
  if (progressText) progressText.textContent = formatProgress(validated, total);

  if (progressBar && total > 0) {
    const percent = Math.round((validated / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', String(percent));
  }
}

/**
 * Show an error message with a retry button.
 * @param {string} message - The error message to display.
 * @param {function} retryCallback - Function to call when retry button is clicked.
 */
export function showError(message, retryCallback) {
  const { errorArea, errorMessage, retryButton } = getElements();
  hideAllAreas();

  if (errorArea) errorArea.classList.remove('hidden');
  if (errorMessage) errorMessage.textContent = message;

  if (retryButton && retryCallback) {
    const newButton = retryButton.cloneNode(true);
    retryButton.replaceWith(newButton);
    newButton.addEventListener('click', retryCallback);
  }
}

/**
 * Show a message when no working channels are available.
 */
export function showNoChannels() {
  const { statusArea, statusText, channelGrid } = getElements();
  hideAllAreas();

  if (channelGrid) channelGrid.innerHTML = '';
  if (statusArea) statusArea.classList.remove('hidden');
  if (statusText) statusText.textContent = 'No working channels found at this time.';
}
