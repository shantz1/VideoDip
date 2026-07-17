import { mediaLocatorSchema, ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { createMediaItem, getMediaKind, getMediaName } from './media.service.js';

const reference = (locator: string) => ({
  locator: mediaLocatorSchema.parse(locator),
  name: getMediaName(locator),
  kind: getMediaKind(locator),
});

describe('createMediaItem', () => {
  it('preserves a host-owned locator without interpreting it as a desktop path', () => {
    const item = createMediaItem(reference('opfs://media/clip.mp4'));
    expect(item.locator).toBe('opfs://media/clip.mp4');
  });

  it('mints a unique id per item', () => {
    const a = createMediaItem(reference('/a.mp4'));
    const b = createMediaItem(reference('/b.mp4'));
    expect(a.id).not.toBe(b.id);
  });

  it('keeps decoded duration when one is available', () => {
    expect(createMediaItem({ ...reference('clip.mp4'), duration: ms(4200) }).duration).toBe(4200);
  });

  it('prefers complete probe metadata over a preliminary decoder duration', () => {
    const item = createMediaItem({
      ...reference('clip.mp4'),
      duration: ms(1000),
      metadata: {
        duration: ms(4200),
        format: 'mov,mp4',
        sizeBytes: 100,
        bitrate: 200,
        streams: [],
      },
    });
    expect(item.duration).toBe(4200);
    expect(item.metadata?.format).toBe('mov,mp4');
  });

  it('uses null instead of inventing unknown metadata', () => {
    const item = createMediaItem(reference('clip.mkv'));
    expect(item.duration).toBeNull();
    expect(item.metadata).toBeNull();
  });
});

describe('portable display helpers', () => {
  it('derives names from Windows, POSIX, and opaque URL-like locators', () => {
    expect(getMediaName('C:\\Users\\shantanu\\Videos\\clip.mp4')).toBe('clip.mp4');
    expect(getMediaName('/home/shantanu/videos/clip.mp4')).toBe('clip.mp4');
    expect(getMediaName('opfs://media/clip.mp4')).toBe('clip.mp4');
  });

  it('recognises audio extensions case-insensitively', () => {
    expect(getMediaKind('C:\\media\\voice.MP3')).toBe('audio');
    expect(getMediaKind('/media/voice.wav')).toBe('audio');
  });

  it('treats accepted non-audio files as video', () => {
    expect(getMediaKind('/media/clip.mp4')).toBe('video');
  });
});
