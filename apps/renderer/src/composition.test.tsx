import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('remotion', () => ({
  AbsoluteFill: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Sequence: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  Audio: ({ src }: { src: string }) => <span data-media="audio" data-src={src} />,
  Video: ({ src }: { src: string }) => <span data-media="video" data-src={src} />,
}));

import {
  getCompositionMetadata,
  videoDipCompositionSchema,
  VideoDipComposition,
  type CompositionClip,
  type VideoDipCompositionProps,
} from './composition.js';

const SETTINGS = {
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 300,
};

const clip = (overrides: Partial<CompositionClip> = {}): CompositionClip => ({
  id: 'clip-a',
  trackKind: 'plugin:overlay',
  mediaKind: 'video',
  src: 'file:///clip.mp4',
  startFrame: 0,
  durationInFrames: 30,
  sourceStartFrame: 0,
  ...overrides,
});

describe('VideoDip composition contract', () => {
  it('accepts a serializable, headless-safe render input', () => {
    const input: VideoDipCompositionProps = { clips: [clip()], settings: SETTINGS };
    expect(videoDipCompositionSchema.safeParse(input).success).toBe(true);
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });

  it('rejects invalid frame boundaries before Remotion renders', () => {
    const result = videoDipCompositionSchema.safeParse({
      clips: [clip({ durationInFrames: 0 })],
      settings: SETTINGS,
    });
    expect(result.success).toBe(false);
  });

  it('uses the same settings as headless composition metadata', () => {
    expect(getCompositionMetadata({ clips: [], settings: SETTINGS })).toEqual(SETTINGS);
  });

  it('dispatches by media kind, independent of arbitrary track metadata', () => {
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[
          clip({ id: 'overlay', trackKind: 'plugin:overlay', mediaKind: 'video' }),
          clip({ id: 'music', trackKind: 'plugin:music-bed', mediaKind: 'audio' }),
        ]}
        settings={SETTINGS}
      />,
    );

    expect(markup).toContain('data-media="video"');
    expect(markup).toContain('data-media="audio"');
  });
});
