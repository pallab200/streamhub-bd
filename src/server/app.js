import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchPlaylist } from './playlistFetcher.js';
import { parseM3U } from './m3uParser.js';
import { validateChannels } from './channelValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// In-memory cache for validated channels
let channelCache = { channels: [], timestamp: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client/')));

// CORS headers for API routes
app.use('/api', (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
  });
  next();
});

/**
 * GET /api/channels
 * Returns pre-validated channels as JSON.
 * Uses server-side HLS manifest validation (checks actual m3u8 content).
 * Results are cached for 10 minutes.
 */
app.get('/api/channels', async (req, res) => {
  try {
    // Return cache if fresh
    if (channelCache.channels.length > 0 && (Date.now() - channelCache.timestamp) < CACHE_TTL_MS) {
      return res.json({
        channels: channelCache.channels,
        total: channelCache.total,
        working: channelCache.channels.length,
        cached: true,
      });
    }

    const result = await fetchPlaylist();

    if (!result.success) {
      return res.status(502).json({
        error: result.error || 'Failed to fetch playlist',
      });
    }

    const channels = parseM3U(result.content);
    const total = channels.length;

    const workingChannels = await validateChannels(channels);

    // Update cache
    channelCache = {
      channels: workingChannels,
      total,
      timestamp: Date.now(),
    };

    res.json({
      channels: workingChannels,
      total,
      working: workingChannels.length,
      cached: false,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/channels/stream
 * SSE endpoint that sends progress events during validation.
 * Events:
 *   { type: "progress", validated, total }
 *   { type: "found", channel } — sent each time a working channel is found
 *   { type: "complete", channels, total, working }
 *   { type: "error", message }
 */
app.get('/api/channels/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
  });
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  function sendEvent(payload) {
    if (!closed) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  try {
    const result = await fetchPlaylist();

    if (!result.success) {
      sendEvent({ type: 'error', message: result.error || 'Failed to fetch playlist' });
      res.end();
      return;
    }

    const channels = parseM3U(result.content);
    const total = channels.length;

    if (total === 0) {
      sendEvent({ type: 'complete', channels: [], total: 0, working: 0 });
      res.end();
      return;
    }

    const workingChannels = await validateChannels(channels, {
      onProgress(validated, totalCount) {
        sendEvent({ type: 'progress', validated, total: totalCount });
      },
    });

    // Update cache
    channelCache = { channels: workingChannels, total, timestamp: Date.now() };

    sendEvent({
      type: 'complete',
      channels: workingChannels,
      total,
      working: workingChannels.length,
    });
  } catch (err) {
    sendEvent({ type: 'error', message: err.message || 'Internal server error' });
  } finally {
    if (!closed) res.end();
  }
});

/**
 * GET /api/logo?url=<encoded_logo_url>
 * Proxies channel logo images through the server.
 */
app.get('/api/logo', async (req, res) => {
  const logoUrl = req.query.url;
  if (!logoUrl) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    new URL(logoUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(logoUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!response.ok) return res.status(response.status).end();

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Timed out' });
    return res.status(502).json({ error: 'Failed to fetch logo' });
  }
});

export default app;
