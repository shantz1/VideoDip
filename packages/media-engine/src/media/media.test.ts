import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { createMediaItem, getMediaKind } from './media.service.js';

describe('createMediaItem', () => {
  it('derives the display name from a Windows-style path', () => {
    const item = createMediaItem('C:\\Users\\shantanu\\Videos\\clip.mp4');
    expect(item.name).toBe('clip.mp4');
  });

  it('derives the display name from a POSIX-style path', () => {
    const item = createMediaItem('/home/shantanu/videos/clip.mp4');
    expect(item.name).toBe('clip.mp4');
  });

  it('preserves the original path unchanged', () => {
    const path = 'C:\\Users\\shantanu\\Videos\\clip.mp4';
    const item = createMediaItem(path);
    expect(item.path).toBe(path);
  });

  it('mints a unique id per item', () => {
    const a = createMediaItem('/a.mp4');
    const b = createMediaItem('/b.mp4');
    expect(a.id).not.toBe(b.id);
  });

  it('falls back to the full path when there is no separator', () => {
    const item = createMediaItem('clip.mp4');
    expect(item.name).toBe('clip.mp4');
  });

  it('keeps decoded duration when one is available', () => {
    expect(createMediaItem('clip.mp4', ms(4200)).duration).toBe(4200);
  });

  it('uses null instead of inventing an unknown duration', () => {
    expect(createMediaItem('clip.mkv').duration).toBeNull();
  });
});

describe('getMediaKind', () => {
  it('recognises audio extensions case-insensitively', () => {
    expect(getMediaKind('C:\\media\\voice.MP3')).toBe('audio');
    expect(getMediaKind('/media/voice.wav')).toBe('audio');
  });

  it('treats accepted non-audio files as video', () => {
    expect(getMediaKind('/media/clip.mp4')).toBe('video');
  });
});
