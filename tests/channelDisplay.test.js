import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderChannels,
  showLoading,
  showProgress,
  showError,
  showNoChannels,
  truncateName,
  formatProgress,
  playChannel,
} from '../src/client/channelDisplay.js';

function setupDOM() {
  document.body.innerHTML = `
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
    <section id="player-overlay" class="player-overlay hidden">
      <div class="player-container">
        <div class="player-header">
          <span id="player-channel-name" class="player-channel-name"></span>
          <button id="player-close" class="player-close" type="button" aria-label="Close player">&times;</button>
        </div>
        <video id="video-player" controls autoplay></video>
      </div>
    </section>
  `;
}

describe('truncateName', () => {
  it('returns name unchanged when 50 characters or fewer', () => {
    const name = 'A'.repeat(50);
    expect(truncateName(name)).toBe(name);
  });

  it('truncates name longer than 50 characters with ellipsis', () => {
    const name = 'A'.repeat(51);
    expect(truncateName(name)).toBe('A'.repeat(50) + '\u2026');
  });

  it('returns empty string unchanged', () => {
    expect(truncateName('')).toBe('');
  });

  it('returns short name unchanged', () => {
    expect(truncateName('CNN')).toBe('CNN');
  });
});

describe('formatProgress', () => {
  it('formats progress string correctly', () => {
    expect(formatProgress(5, 100)).toBe('5 of 100 channels validated');
  });

  it('handles zero values', () => {
    expect(formatProgress(0, 0)).toBe('0 of 0 channels validated');
  });

  it('handles equal values', () => {
    expect(formatProgress(50, 50)).toBe('50 of 50 channels validated');
  });
});

describe('renderChannels', () => {
  beforeEach(setupDOM);

  it('renders channel cards in the grid', () => {
    const channels = [
      { name: 'Channel One', logoUrl: 'https://example.com/logo1.png', streamUrl: 'https://stream.com/1' },
      { name: 'Channel Two', logoUrl: 'https://example.com/logo2.png', streamUrl: 'https://stream.com/2' },
    ];

    renderChannels(channels);

    const grid = document.getElementById('channel-grid');
    expect(grid.children.length).toBe(2);
  });

  it('creates div cards with role button and data attributes', () => {
    const channels = [
      { name: 'Test Channel', logoUrl: 'https://example.com/logo.png', streamUrl: 'https://stream.com/test' },
    ];

    renderChannels(channels);

    const card = document.querySelector('.channel-card');
    expect(card.tagName).toBe('DIV');
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
    expect(card.dataset.streamUrl).toBe('https://stream.com/test');
    expect(card.dataset.channelName).toBe('Test Channel');
  });

  it('displays channel name and logo image', () => {
    const channels = [
      { name: 'My Channel', logoUrl: 'https://example.com/logo.png', streamUrl: 'https://stream.com/1' },
    ];

    renderChannels(channels);

    const img = document.querySelector('.channel-logo');
    expect(img).not.toBeNull();
    expect(img.src).toContain('https://example.com/logo.png');

    const name = document.querySelector('.channel-name');
    expect(name.textContent).toBe('My Channel');
  });

  it('truncates long channel names with ellipsis', () => {
    const longName = 'A'.repeat(60);
    const channels = [
      { name: longName, logoUrl: 'https://example.com/logo.png', streamUrl: 'https://stream.com/1' },
    ];

    renderChannels(channels);

    const name = document.querySelector('.channel-name');
    expect(name.textContent).toBe('A'.repeat(50) + '\u2026');
    expect(name.title).toBe(longName);
  });

  it('shows placeholder when logoUrl is empty', () => {
    const channels = [
      { name: 'No Logo Channel', logoUrl: '', streamUrl: 'https://stream.com/1' },
    ];

    renderChannels(channels);

    const placeholder = document.querySelector('.channel-logo-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder.textContent).toBe('NL');
  });

  it('clears grid before rendering new channels', () => {
    const channels1 = [
      { name: 'First', logoUrl: '', streamUrl: 'https://stream.com/1' },
    ];
    const channels2 = [
      { name: 'Second', logoUrl: '', streamUrl: 'https://stream.com/2' },
    ];

    renderChannels(channels1);
    renderChannels(channels2);

    const grid = document.getElementById('channel-grid');
    expect(grid.children.length).toBe(1);
    expect(grid.querySelector('.channel-name').textContent).toBe('Second');
  });

  it('handles logo load error by replacing with placeholder', () => {
    const channels = [
      { name: 'Error Logo', logoUrl: 'https://example.com/bad.png', streamUrl: 'https://stream.com/1' },
    ];

    renderChannels(channels);

    const img = document.querySelector('.channel-logo');
    // First onerror: tries proxy
    img.onerror();
    expect(img.src).toContain('/api/logo?url=');

    // Second onerror: proxy also failed, shows placeholder
    img.onerror();

    const placeholder = document.querySelector('.channel-logo-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder.textContent).toBe('EL');
    expect(document.querySelector('.channel-logo')).toBeNull();
  });

  it('hides all state areas when rendering channels', () => {
    document.getElementById('loading-area').classList.remove('hidden');

    renderChannels([{ name: 'Ch', logoUrl: '', streamUrl: 'https://stream.com/1' }]);

    expect(document.getElementById('loading-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('progress-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('error-area').classList.contains('hidden')).toBe(true);
  });
});

describe('showLoading', () => {
  beforeEach(setupDOM);

  it('shows loading area and hides others', () => {
    showLoading();

    expect(document.getElementById('loading-area').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('progress-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('error-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('status-area').classList.contains('hidden')).toBe(true);
  });

  it('clears channel grid content', () => {
    const grid = document.getElementById('channel-grid');
    grid.innerHTML = '<div>old content</div>';

    showLoading();

    expect(grid.innerHTML).toBe('');
  });
});

describe('showProgress', () => {
  beforeEach(setupDOM);

  it('shows progress area and hides loading', () => {
    document.getElementById('loading-area').classList.remove('hidden');

    showProgress(10, 50);

    expect(document.getElementById('progress-area').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('loading-area').classList.contains('hidden')).toBe(true);
  });

  it('displays formatted progress text', () => {
    showProgress(25, 100);

    expect(document.getElementById('progress-text').textContent).toBe('25 of 100 channels validated');
  });

  it('updates progress bar width', () => {
    showProgress(50, 100);

    const bar = document.getElementById('progress-bar');
    expect(bar.style.width).toBe('50%');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
  });
});

describe('showError', () => {
  beforeEach(setupDOM);

  it('shows error area with message', () => {
    showError('Something went wrong', () => {});

    expect(document.getElementById('error-area').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('error-message').textContent).toBe('Something went wrong');
  });

  it('hides other areas', () => {
    document.getElementById('loading-area').classList.remove('hidden');

    showError('Error', () => {});

    expect(document.getElementById('loading-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('progress-area').classList.contains('hidden')).toBe(true);
  });

  it('retry button calls the callback when clicked', () => {
    let called = false;
    showError('Error', () => { called = true; });

    document.getElementById('retry-button').click();

    expect(called).toBe(true);
  });
});

describe('showNoChannels', () => {
  beforeEach(setupDOM);

  it('shows status area with no channels message', () => {
    showNoChannels();

    expect(document.getElementById('status-area').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-text').textContent).toBe('No working channels found at this time.');
  });

  it('clears channel grid', () => {
    const grid = document.getElementById('channel-grid');
    grid.innerHTML = '<div>old</div>';

    showNoChannels();

    expect(grid.innerHTML).toBe('');
  });

  it('hides other areas', () => {
    document.getElementById('loading-area').classList.remove('hidden');

    showNoChannels();

    expect(document.getElementById('loading-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('progress-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('error-area').classList.contains('hidden')).toBe(true);
  });
});

describe('playChannel', () => {
  beforeEach(setupDOM);

  it('shows the player overlay and sets channel name', () => {
    playChannel('Test Channel', 'https://stream.com/test.m3u8');

    const overlay = document.getElementById('player-overlay');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('player-channel-name').textContent).toBe('Test Channel');
  });

  it('closes player when close button is clicked', () => {
    playChannel('Test Channel', 'https://stream.com/test.m3u8');

    const closeBtn = document.getElementById('player-close');
    closeBtn.click();

    const overlay = document.getElementById('player-overlay');
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('closes player on Escape key', () => {
    playChannel('Test Channel', 'https://stream.com/test.m3u8');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    const overlay = document.getElementById('player-overlay');
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('closes player when clicking overlay background', () => {
    playChannel('Test Channel', 'https://stream.com/test.m3u8');

    const overlay = document.getElementById('player-overlay');
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('sets video src directly when HLS.js is not available', () => {
    playChannel('Test Channel', 'https://stream.com/test.m3u8');

    const video = document.getElementById('video-player');
    expect(video.src).toBe('https://stream.com/test.m3u8');
  });
});
