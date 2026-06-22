import { describe, it, expect, vi } from 'vitest';
import { parseM3U } from '../src/server/m3uParser.js';

describe('M3U Parser', () => {
  it('should parse valid M3U content with multiple entries', () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-logo="http://example.com/logo1.png" group-title="News",Channel One
http://stream1.example.com/live
#EXTINF:-1 tvg-logo="http://example.com/logo2.png" group-title="Sports",Channel Two
http://stream2.example.com/live`;

    const result = parseM3U(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'Channel One',
      logoUrl: 'http://example.com/logo1.png',
      streamUrl: 'http://stream1.example.com/live',
    });
    expect(result[1]).toEqual({
      name: 'Channel Two',
      logoUrl: 'http://example.com/logo2.png',
      streamUrl: 'http://stream2.example.com/live',
    });
  });

  it('should return empty array for content without #EXTM3U header', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = `#EXTINF:-1,Channel One
http://stream1.example.com/live`;

    const result = parseM3U(content);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should return empty array for empty content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseM3U('')).toEqual([]);
    expect(parseM3U(null)).toEqual([]);
    expect(parseM3U(undefined)).toEqual([]);

    warnSpy.mockRestore();
  });

  it('should set logoUrl to empty string when tvg-logo is missing', () => {
    const content = `#EXTM3U
#EXTINF:-1 group-title="News",Channel No Logo
http://stream.example.com/live`;

    const result = parseM3U(content);

    expect(result).toHaveLength(1);
    expect(result[0].logoUrl).toBe('');
    expect(result[0].name).toBe('Channel No Logo');
  });

  it('should skip entries without a valid stream URL', () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-logo="http://logo.com/a.png",Channel One
#EXTINF:-1 tvg-logo="http://logo.com/b.png",Channel Two
http://stream2.example.com/live`;

    const result = parseM3U(content);

    // Channel One has no stream URL (next line is another #EXTINF)
    // Channel Two has a valid stream URL
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Channel Two');
  });

  it('should skip empty lines and comments when finding stream URL', () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-logo="http://logo.com/a.png",Channel One

# This is a comment
http://stream.example.com/live`;

    const result = parseM3U(content);

    expect(result).toHaveLength(1);
    expect(result[0].streamUrl).toBe('http://stream.example.com/live');
  });

  it('should extract channel name from text after last comma', () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-logo="http://logo.com/a.png" group-title="Entertainment, Fun",My Channel, HD
http://stream.example.com/live`;

    const result = parseM3U(content);

    expect(result).toHaveLength(1);
    // Name should be text after the LAST comma
    expect(result[0].name).toBe('HD');
  });

  it('should return empty array when #EXTM3U header exists but no valid entries', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const content = `#EXTM3U
# Just comments here
# No actual channel entries`;

    const result = parseM3U(content);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should handle Windows-style line endings (CRLF)', () => {
    const content = '#EXTM3U\r\n#EXTINF:-1 tvg-logo="http://logo.com/a.png",Channel One\r\nhttp://stream.example.com/live\r\n';

    const result = parseM3U(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Channel One',
      logoUrl: 'http://logo.com/a.png',
      streamUrl: 'http://stream.example.com/live',
    });
  });
});
