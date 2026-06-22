import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock EventSource for testing SSE connections.
 */
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.readyState = 0; // CONNECTING
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // Helper to simulate receiving a message
  _emit(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  // Helper to simulate an error
  _emitError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

MockEventSource.instances = [];

function setupDOM() {
  document.body.innerHTML = `
    <main>
      <section id="loading-area" class="loading-area hidden">
        <div class="spinner"></div>
        <p class="loading-text">Loading playlist…</p>
      </section>
      <section id="progress-area" class="progress-area hidden">
        <div class="progress-bar-container">
          <div class="progress-bar" id="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <p class="progress-text" id="progress-text">0 of 0 channels validated</p>
      </section>
      <section id="status-area" class="status-area hidden">
        <p class="status-text" id="status-text"></p>
      </section>
      <section id="error-area" class="error-area hidden">
        <p class="error-message" id="error-message"></p>
        <button class="retry-button" id="retry-button" type="button">Retry</button>
      </section>
      <section id="search-area" class="search-area hidden">
        <div class="search-container">
          <input type="text" id="search-input" class="search-input" placeholder="Search channels...">
          <span id="channel-count" class="channel-count"></span>
        </div>
      </section>
      <section id="channel-grid" class="channel-grid"></section>
    </main>
  `;
}

// We need to dynamically import the controller so we can control when it loads
// and mock EventSource/fetch before the module initializes.
let controllerModule;

describe('Frontend Controller', () => {
  beforeEach(() => {
    setupDOM();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.resetModules();
  });

  async function loadController() {
    // Dynamically import to get fresh module state each time
    controllerModule = await import('../src/client/controller.js');
    return controllerModule;
  }

  describe('initialize()', () => {
    it('shows loading indicator on start', async () => {
      await loadController();

      // initialize() is called at module load — loading area should be visible
      expect(document.getElementById('loading-area').classList.contains('hidden')).toBe(false);
    });

    it('creates an EventSource connection to /api/channels/stream', async () => {
      await loadController();

      expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(1);
      expect(MockEventSource.instances[0].url).toBe('/api/channels/stream');
    });

    it('starts auto-update timer', async () => {
      await loadController();

      // Complete the initial fetch so updateInProgress becomes false
      const es = MockEventSource.instances[0];
      es._emit({ type: 'complete', channels: [{ name: 'Ch', logoUrl: '', streamUrl: 'https://s.com/1' }], total: 1, working: 1 });

      const instancesBefore = MockEventSource.instances.length;
      vi.advanceTimersByTime(30 * 60 * 1000);

      // A new EventSource should be created for the auto-update
      expect(MockEventSource.instances.length).toBeGreaterThan(instancesBefore);
    });
  });

  describe('fetchAndDisplay() - SSE progress events', () => {
    it('shows progress when receiving progress events', async () => {
      await loadController();

      const es = MockEventSource.instances[0];
      es._emit({ type: 'progress', validated: 10, total: 50 });

      const progressText = document.getElementById('progress-text');
      expect(progressText.textContent).toBe('10 of 50 channels validated');
    });

    it('renders channels on complete event', async () => {
      await loadController();

      const es = MockEventSource.instances[0];
      const channels = [
        { name: 'Channel 1', logoUrl: 'https://example.com/1.png', streamUrl: 'https://stream.com/1' },
        { name: 'Channel 2', logoUrl: 'https://example.com/2.png', streamUrl: 'https://stream.com/2' },
      ];

      es._emit({ type: 'complete', channels, total: 2, working: 2 });

      const grid = document.getElementById('channel-grid');
      expect(grid.children.length).toBe(2);
    });

    it('shows no channels message when complete event has empty channels', async () => {
      await loadController();

      const es = MockEventSource.instances[0];
      es._emit({ type: 'complete', channels: [], total: 5, working: 0 });

      expect(document.getElementById('status-area').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('status-text').textContent).toBe('No working channels found at this time.');
    });

    it('shows error with retry on error event', async () => {
      await loadController();

      const es = MockEventSource.instances[0];
      es._emit({ type: 'error', message: 'Failed to fetch playlist' });

      expect(document.getElementById('error-area').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('error-message').textContent).toBe('Failed to fetch playlist');
    });

    it('closes EventSource after complete event', async () => {
      await loadController();

      const es = MockEventSource.instances[0];
      es._emit({ type: 'complete', channels: [{ name: 'Ch', logoUrl: '', streamUrl: 'https://s.com/1' }], total: 1, working: 1 });

      expect(es.readyState).toBe(2); // CLOSED
    });
  });

  describe('fetchAndDisplay() - auto-update behavior', () => {
    it('shows auto-update progress without clearing channels during re-fetch', async () => {
      await loadController();

      // First: complete initial load with channels
      const es1 = MockEventSource.instances[0];
      const channels = [
        { name: 'Channel 1', logoUrl: '', streamUrl: 'https://stream.com/1' },
      ];
      es1._emit({ type: 'complete', channels, total: 1, working: 1 });

      // Now trigger auto-update
      vi.advanceTimersByTime(30 * 60 * 1000);

      const es2 = MockEventSource.instances[MockEventSource.instances.length - 1];
      es2._emit({ type: 'progress', validated: 5, total: 20 });

      // Channel grid should still have the previously rendered channels
      const grid = document.getElementById('channel-grid');
      expect(grid.children.length).toBe(1);

      // Auto-update progress indicator should be shown
      const autoProgress = document.getElementById('auto-update-progress');
      expect(autoProgress).not.toBeNull();
      expect(autoProgress.textContent).toContain('5 of 20');
    });

    it('does not re-render if channels have not changed', async () => {
      await loadController();

      const channels = [
        { name: 'Channel 1', logoUrl: 'https://logo.com/1.png', streamUrl: 'https://stream.com/1' },
      ];

      // Complete initial load
      const es1 = MockEventSource.instances[0];
      es1._emit({ type: 'complete', channels, total: 1, working: 1 });

      const grid = document.getElementById('channel-grid');
      const firstCard = grid.children[0];

      // Trigger auto-update with same channels
      vi.advanceTimersByTime(30 * 60 * 1000);

      const es2 = MockEventSource.instances[MockEventSource.instances.length - 1];
      es2._emit({ type: 'complete', channels, total: 1, working: 1 });

      // The DOM should not have been re-rendered (same reference)
      expect(grid.children[0]).toBe(firstCard);
    });

    it('silently retains channels on error during auto-update', async () => {
      await loadController();

      const channels = [
        { name: 'Channel 1', logoUrl: '', streamUrl: 'https://stream.com/1' },
      ];

      // Complete initial load
      const es1 = MockEventSource.instances[0];
      es1._emit({ type: 'complete', channels, total: 1, working: 1 });

      // Trigger auto-update
      vi.advanceTimersByTime(30 * 60 * 1000);

      const es2 = MockEventSource.instances[MockEventSource.instances.length - 1];
      es2._emit({ type: 'error', message: 'Network failure' });

      // Channels should still be displayed
      const grid = document.getElementById('channel-grid');
      expect(grid.children.length).toBe(1);

      // Error area should NOT be shown
      expect(document.getElementById('error-area').classList.contains('hidden')).toBe(true);
    });
  });

  describe('SSE connection loss and fallback', () => {
    it('shows reconnection indicator when SSE fails with channels displayed', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ channels: [{ name: 'Ch', logoUrl: '', streamUrl: 'https://s.com/1' }], total: 1, working: 1 }),
      }));

      await loadController();

      const channels = [
        { name: 'Channel 1', logoUrl: '', streamUrl: 'https://stream.com/1' },
      ];

      // Complete initial load
      const es1 = MockEventSource.instances[0];
      es1._emit({ type: 'complete', channels, total: 1, working: 1 });

      // Trigger auto-update
      vi.advanceTimersByTime(30 * 60 * 1000);

      const es2 = MockEventSource.instances[MockEventSource.instances.length - 1];
      es2._emitError();

      // Reconnection indicator should appear
      const indicator = document.getElementById('reconnection-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator.textContent).toBe('Reconnecting…');
    });

    it('falls back to polling /api/channels on SSE failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ channels: [{ name: 'Polled Channel', logoUrl: '', streamUrl: 'https://s.com/1' }], total: 1, working: 1 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await loadController();

      const channels = [
        { name: 'Channel 1', logoUrl: '', streamUrl: 'https://stream.com/1' },
      ];

      // Complete initial load
      const es1 = MockEventSource.instances[0];
      es1._emit({ type: 'complete', channels, total: 1, working: 1 });

      // Stop auto-update to avoid infinite timer loop in test
      controllerModule.stopAutoUpdate();

      // Call fetchAndDisplay directly to simulate a re-fetch attempt
      const fetchPromise = controllerModule.fetchAndDisplay();

      const es2 = MockEventSource.instances[MockEventSource.instances.length - 1];
      es2._emitError();

      // Allow the fallback polling promise to resolve
      await fetchPromise;

      expect(mockFetch).toHaveBeenCalledWith('/api/channels');
    });

    it('shows error with retry when SSE fails without channels displayed', async () => {
      await loadController();

      const es = MockEventSource.instances[0];
      es._emitError();

      expect(document.getElementById('error-area').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('error-message').textContent).toBe('Connection lost. Please try again.');
    });
  });

  describe('startAutoUpdate() / stopAutoUpdate()', () => {
    it('stopAutoUpdate prevents further fetches', async () => {
      await loadController();

      // Complete initial load
      const es1 = MockEventSource.instances[0];
      es1._emit({ type: 'complete', channels: [{ name: 'Ch', logoUrl: '', streamUrl: 'https://s.com/1' }], total: 1, working: 1 });

      const instanceCount = MockEventSource.instances.length;

      // Stop auto-update
      controllerModule.stopAutoUpdate();

      // Advance past the interval
      vi.advanceTimersByTime(30 * 60 * 1000);

      // No new EventSource should be created
      expect(MockEventSource.instances.length).toBe(instanceCount);
    });

    it('startAutoUpdate with custom interval works', async () => {
      await loadController();

      // Complete initial load
      const es1 = MockEventSource.instances[0];
      es1._emit({ type: 'complete', channels: [{ name: 'Ch', logoUrl: '', streamUrl: 'https://s.com/1' }], total: 1, working: 1 });

      // Restart with 5 minute interval
      controllerModule.startAutoUpdate(5 * 60 * 1000);

      const instanceCount = MockEventSource.instances.length;
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(MockEventSource.instances.length).toBeGreaterThan(instanceCount);
    });
  });
});
