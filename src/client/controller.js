/**
 * Frontend Controller Module
 * Orchestrates fetching, SSE progress tracking, and auto-update scheduling.
 */

import { renderChannels, showLoading, showProgress, showError, showNoChannels, filterChannels } from './channelDisplay.js';

/** Default auto-update interval: 30 minutes */
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

/** Polling fallback interval when SSE connection is lost (10 seconds) */
const POLLING_FALLBACK_INTERVAL_MS = 10000;

/** Currently displayed channels (used for diff comparison) */
let currentChannels = null;

/** Auto-update interval timer ID */
let autoUpdateTimer = null;

/** Active EventSource connection */
let activeEventSource = null;

/** Whether an update is currently in progress */
let updateInProgress = false;

/** Reconnection indicator element reference */
let reconnectionIndicator = null;

/**
 * Initialize the controller.
 * Triggers the first fetch and starts auto-update scheduling.
 */
export function initialize() {
  showLoading();
  fetchAndDisplay();
  startAutoUpdate(DEFAULT_INTERVAL_MS);

  // Wire up search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterChannels();
    });
  }
}

/**
 * Fetch channel data via SSE and update the display.
 * Connects to /api/channels/stream, handles progress/complete/error events.
 * During auto-update (when channels are already displayed), shows progress
 * without removing the current channel grid.
 * @returns {Promise<void>}
 */
export function fetchAndDisplay() {
  return new Promise((resolve, reject) => {
    const isAutoUpdate = currentChannels !== null && currentChannels.length > 0;

    if (!isAutoUpdate) {
      showLoading();
    }

    updateInProgress = true;

    // Close any existing SSE connection
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }

    removeReconnectionIndicator();

    const eventSource = new EventSource('/api/channels/stream');
    activeEventSource = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'progress':
            handleProgress(data.validated, data.total, isAutoUpdate);
            break;

          case 'complete':
            handleComplete(data.channels, isAutoUpdate);
            eventSource.close();
            activeEventSource = null;
            updateInProgress = false;
            resolve();
            break;

          case 'error':
            handleError(data.message, isAutoUpdate);
            eventSource.close();
            activeEventSource = null;
            updateInProgress = false;
            resolve();
            break;

          default:
            break;
        }
      } catch (parseError) {
        // Ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      activeEventSource = null;
      updateInProgress = false;

      // If we have current channels displayed, show reconnection indicator
      // and fall back to polling
      if (currentChannels !== null && currentChannels.length > 0) {
        showReconnectionIndicator();
        fallbackToPoll().then(resolve).catch(resolve);
      } else {
        showError('Connection lost. Please try again.', fetchAndDisplay);
        resolve();
      }
    };
  });
}

/**
 * Start periodic auto-update at the specified interval.
 * @param {number} [intervalMs] - Interval in milliseconds (default: 30 minutes).
 */
export function startAutoUpdate(intervalMs) {
  const interval = intervalMs || DEFAULT_INTERVAL_MS;

  // Clear any existing timer
  stopAutoUpdate();

  autoUpdateTimer = setInterval(() => {
    if (!updateInProgress) {
      fetchAndDisplay();
    }
  }, interval);
}

/**
 * Stop the auto-update timer.
 */
export function stopAutoUpdate() {
  if (autoUpdateTimer !== null) {
    clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
  }
}

/**
 * Handle progress events from SSE.
 * During auto-update, shows progress without clearing the channel grid.
 * @param {number} validated - Number of channels validated so far.
 * @param {number} total - Total number of channels.
 * @param {boolean} isAutoUpdate - Whether this is an auto-update (channels already displayed).
 */
function handleProgress(validated, total, isAutoUpdate) {
  if (isAutoUpdate) {
    showAutoUpdateProgress(validated, total);
  } else {
    showProgress(validated, total);
  }
}

/**
 * Handle complete events from SSE.
 * Compares new data to current state and only re-renders if changed.
 * @param {Array} channels - Array of working channel objects.
 * @param {boolean} isAutoUpdate - Whether this is an auto-update.
 */
function handleComplete(channels, isAutoUpdate) {
  hideAutoUpdateProgress();

  if (channels.length === 0) {
    currentChannels = [];
    showNoChannels();
    return;
  }

  // Compare new channels to current state to avoid unnecessary re-renders
  if (!channelsChanged(currentChannels, channels)) {
    return;
  }

  currentChannels = channels;
  renderChannels(channels);
}

/**
 * Handle error events from SSE.
 * During auto-update, silently retains current channels (per requirement 5.5).
 * On initial load, shows error with retry.
 * @param {string} message - Error message.
 * @param {boolean} isAutoUpdate - Whether this is an auto-update.
 */
function handleError(message, isAutoUpdate) {
  hideAutoUpdateProgress();

  if (isAutoUpdate) {
    // Requirement 5.5: retain current channel list on re-fetch failure
    return;
  }

  showError(message, fetchAndDisplay);
}

/**
 * Compare two channel arrays to determine if re-rendering is needed.
 * @param {Array|null} oldChannels - Previously displayed channels.
 * @param {Array} newChannels - Newly received channels.
 * @returns {boolean} True if channels have changed.
 */
function channelsChanged(oldChannels, newChannels) {
  if (oldChannels === null) return true;
  if (oldChannels.length !== newChannels.length) return true;

  for (let i = 0; i < oldChannels.length; i++) {
    const oldCh = oldChannels[i];
    const newCh = newChannels[i];
    if (
      oldCh.name !== newCh.name ||
      oldCh.logoUrl !== newCh.logoUrl ||
      oldCh.streamUrl !== newCh.streamUrl
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Show a subtle progress indicator during auto-update without removing current channels.
 * @param {number} validated - Channels validated so far.
 * @param {number} total - Total channels.
 */
function showAutoUpdateProgress(validated, total) {
  let indicator = document.getElementById('auto-update-progress');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'auto-update-progress';
    indicator.className = 'auto-update-progress';
    indicator.setAttribute('aria-live', 'polite');
    indicator.setAttribute('role', 'status');

    const main = document.querySelector('main');
    const grid = document.getElementById('channel-grid');
    if (main && grid) {
      main.insertBefore(indicator, grid);
    } else if (main) {
      main.appendChild(indicator);
    }
  }

  indicator.textContent = `Updating: ${validated} of ${total} channels validated`;
  indicator.classList.remove('hidden');
}

/**
 * Hide the auto-update progress indicator.
 */
function hideAutoUpdateProgress() {
  const indicator = document.getElementById('auto-update-progress');
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

/**
 * Show a reconnection indicator when SSE connection is lost.
 */
function showReconnectionIndicator() {
  if (reconnectionIndicator) return;

  reconnectionIndicator = document.createElement('div');
  reconnectionIndicator.id = 'reconnection-indicator';
  reconnectionIndicator.className = 'reconnection-indicator';
  reconnectionIndicator.setAttribute('aria-live', 'polite');
  reconnectionIndicator.setAttribute('role', 'status');
  reconnectionIndicator.textContent = 'Reconnecting…';

  const main = document.querySelector('main');
  const grid = document.getElementById('channel-grid');
  if (main && grid) {
    main.insertBefore(reconnectionIndicator, grid);
  } else if (main) {
    main.appendChild(reconnectionIndicator);
  }
}

/**
 * Remove the reconnection indicator.
 */
function removeReconnectionIndicator() {
  if (reconnectionIndicator) {
    reconnectionIndicator.remove();
    reconnectionIndicator = null;
  }

  const existing = document.getElementById('reconnection-indicator');
  if (existing) {
    existing.remove();
  }
}

/**
 * Fallback to polling when SSE connection fails.
 * Attempts a single fetch via the JSON endpoint.
 * @returns {Promise<void>}
 */
async function fallbackToPoll() {
  try {
    const response = await fetch('/api/channels');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    removeReconnectionIndicator();

    if (data.channels && data.channels.length > 0) {
      if (channelsChanged(currentChannels, data.channels)) {
        currentChannels = data.channels;
        renderChannels(data.channels);
      }
    } else {
      currentChannels = [];
      showNoChannels();
    }
  } catch (error) {
    // Retain current channels on polling failure (requirement 5.5)
    removeReconnectionIndicator();
  }
}

// Auto-start when module loads (DOM is already parsed for type="module" scripts)
initialize();
