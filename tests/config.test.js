import { describe, it, expect } from 'vitest';
import {
  SOURCE_URL,
  FETCH_TIMEOUT,
  VALIDATE_TIMEOUT,
  MAX_CONCURRENCY,
  MAX_REDIRECTS,
  UPDATE_INTERVAL,
  MIN_INTERVAL,
  MAX_INTERVAL,
  clampInterval,
} from '../src/server/config.js';

describe('config constants', () => {
  it('SOURCE_URL points to the expected GitHub raw URL', () => {
    expect(SOURCE_URL).toBe(
      'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u'
    );
  });

  it('FETCH_TIMEOUT is 15000ms', () => {
    expect(FETCH_TIMEOUT).toBe(15000);
  });

  it('VALIDATE_TIMEOUT is 10000ms', () => {
    expect(VALIDATE_TIMEOUT).toBe(10000);
  });

  it('MAX_CONCURRENCY is 20', () => {
    expect(MAX_CONCURRENCY).toBe(20);
  });

  it('MAX_REDIRECTS is 5', () => {
    expect(MAX_REDIRECTS).toBe(5);
  });

  it('UPDATE_INTERVAL is 30 minutes in ms', () => {
    expect(UPDATE_INTERVAL).toBe(30 * 60 * 1000);
  });

  it('MIN_INTERVAL is 5 minutes in ms', () => {
    expect(MIN_INTERVAL).toBe(5 * 60 * 1000);
  });

  it('MAX_INTERVAL is 24 hours in ms', () => {
    expect(MAX_INTERVAL).toBe(24 * 60 * 60 * 1000);
  });
});

describe('clampInterval', () => {
  it('returns MIN_INTERVAL when value is below minimum', () => {
    expect(clampInterval(0)).toBe(MIN_INTERVAL);
    expect(clampInterval(1000)).toBe(MIN_INTERVAL);
    expect(clampInterval(MIN_INTERVAL - 1)).toBe(MIN_INTERVAL);
  });

  it('returns MAX_INTERVAL when value is above maximum', () => {
    expect(clampInterval(MAX_INTERVAL + 1)).toBe(MAX_INTERVAL);
    expect(clampInterval(Number.MAX_SAFE_INTEGER)).toBe(MAX_INTERVAL);
  });

  it('returns the value unchanged when within bounds', () => {
    expect(clampInterval(MIN_INTERVAL)).toBe(MIN_INTERVAL);
    expect(clampInterval(MAX_INTERVAL)).toBe(MAX_INTERVAL);
    expect(clampInterval(UPDATE_INTERVAL)).toBe(UPDATE_INTERVAL);
    expect(clampInterval(10 * 60 * 1000)).toBe(10 * 60 * 1000);
  });

  it('handles negative values by clamping to MIN_INTERVAL', () => {
    expect(clampInterval(-1)).toBe(MIN_INTERVAL);
    expect(clampInterval(-100000)).toBe(MIN_INTERVAL);
  });
});
