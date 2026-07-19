import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrame = vi.hoisted(() => ({ current: 0 }));

vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, style }: { children: ReactNode; style?: unknown }) => (
    <main data-style={JSON.stringify(style)}>{children}</main>
  ),
  Sequence: ({ children, durationInFrames }: { children: ReactNode; durationInFrames: number }) => (
    <section data-duration={durationInFrames}>{children}</section>
  ),
  Audio: ({ src }: { src: string }) => <span data-media="audio" data-src={src} />,
  OffthreadVideo: ({ src, style }: { src: string; style?: unknown }) => (
    <span data-media="video" data-src={src} data-style={JSON.stringify(style)} />
  ),
  useCurrentFrame: () => mockFrame.current,
}));

beforeEach(() => {
  mockFrame.current = 0;
});

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

const SUBTITLE_STYLE = {
  fontFamily: 'sans-serif',
  fontSize: 48,
  fontWeight: 700,
  isItalic: false,
  isUnderlined: false,
  letterSpacing: 0,
  lineHeight: 1.2,
  foreground: '#ffffff',
  opacity: 1,
  backgroundEnabled: true,
  background: '#000000',
  backgroundOpacity: 0.72,
  strokeColor: '#000000',
  strokeWidth: 0,
  shadowColor: '#000000',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowOpacity: 0,
  alignment: 'center' as const,
  maxWidth: 0.9,
  padding: 14,
  borderRadius: 8,
  positionX: 0.5,
  positionY: 0.88,
  rotation: 0,
  scale: 1,
  animation: 'fade' as const,
};

const clip = (overrides: Partial<CompositionClip> = {}): CompositionClip => ({
  id: 'clip-a',
  trackKind: 'plugin:overlay',
  mediaKind: 'video',
  src: 'file:///clip.mp4',
  startFrame: 0,
  durationInFrames: 30,
  sourceStartFrame: 0,
  transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  opacity: 1,
  blendMode: 'normal',
  isEnabled: true,
  animation: [],
  audio: { volume: 1, isMuted: false, fadeInFrames: 0, fadeOutFrames: 0 },
  transitionIn: null,
  transitionOut: null,
  ...overrides,
});

describe('VideoDip composition contract', () => {
  it('accepts a serializable, headless-safe render input', () => {
    const input: VideoDipCompositionProps = { clips: [clip()], subtitles: [], settings: SETTINGS };
    expect(videoDipCompositionSchema.safeParse(input).success).toBe(true);
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });

  it('rejects invalid frame boundaries before Remotion renders', () => {
    const result = videoDipCompositionSchema.safeParse({
      clips: [clip({ durationInFrames: 0 })],
      subtitles: [],
      settings: SETTINGS,
    });
    expect(result.success).toBe(false);
  });

  it('uses the same settings as headless composition metadata', () => {
    expect(getCompositionMetadata({ clips: [], subtitles: [], settings: SETTINGS })).toEqual(
      SETTINGS,
    );
  });

  it('dispatches by media kind, independent of arbitrary track metadata', () => {
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[
          clip({ id: 'overlay', trackKind: 'plugin:overlay', mediaKind: 'video' }),
          clip({ id: 'music', trackKind: 'plugin:music-bed', mediaKind: 'audio' }),
        ]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );

    expect(markup).toContain('data-media="video"');
    expect(markup).toContain('data-media="audio"');
  });

  it('does not render a disabled clip', () => {
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ isEnabled: false })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(markup).not.toContain('data-media="video"');
  });

  it('rejects invalid transform and opacity values at the render boundary', () => {
    expect(
      videoDipCompositionSchema.safeParse({
        clips: [clip({ transform: { ...clip().transform, scaleX: 0 }, opacity: 2 })],
        subtitles: [],
        settings: SETTINGS,
      }).success,
    ).toBe(false);
  });

  it('applies clip-relative keyframes to visual style', () => {
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[
          clip({
            animation: [
              { property: 'opacity', frame: 0, value: 0.25, easing: 'linear' },
              { property: 'opacity', frame: 15, value: 1, easing: 'ease-out' },
            ],
          }),
        ]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(markup).toContain('&quot;opacity&quot;:0.25');
  });

  it('accepts serializable per-clip audio mix settings', () => {
    expect(
      videoDipCompositionSchema.safeParse({
        clips: [
          clip({
            mediaKind: 'audio',
            audio: { volume: 0.5, isMuted: false, fadeInFrames: 5, fadeOutFrames: 10 },
          }),
        ],
        subtitles: [],
        settings: SETTINGS,
      }).success,
    ).toBe(true);
  });

  it('extends the outgoing sequence and fades the incoming clip at a transition cut', () => {
    const transition = {
      id: 'transition-a',
      kind: 'crossfade',
      durationInFrames: 15,
      parameters: {},
    };
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[
          clip({ id: 'outgoing', transitionOut: transition }),
          clip({ id: 'incoming', startFrame: 30, transitionIn: transition }),
        ]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );

    expect(markup).toContain('data-duration="45"');
    expect(markup).toContain('&quot;opacity&quot;:0');
    expect(
      videoDipCompositionSchema.safeParse({
        clips: [clip({ transitionOut: transition })],
        subtitles: [],
        settings: SETTINGS,
      }).success,
    ).toBe(true);
  });

  it('flashes white instead of fading through black for dip-to-white', () => {
    const transition = { id: 't', kind: 'dip-to-white', durationInFrames: 15, parameters: {} };
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ id: 'incoming', transitionIn: transition })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(markup).toContain('&quot;opacity&quot;:0');
    expect(markup).toContain('&quot;backgroundColor&quot;:&quot;white&quot;,&quot;opacity&quot;:1');
  });

  it('translates the incoming clip vertically for slide-up and slide-down', () => {
    const up = { id: 't', kind: 'slide-up', durationInFrames: 15, parameters: {} };
    const upMarkup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ id: 'incoming', transitionIn: up })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(upMarkup).toContain('translateY(100%)');

    const down = { id: 't', kind: 'slide-down', durationInFrames: 15, parameters: {} };
    const downMarkup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ id: 'incoming', transitionIn: down })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(downMarkup).toContain('translateY(-100%)');
  });

  it('masks the incoming clip with a clip-path for wipe-up and wipe-down', () => {
    const up = { id: 't', kind: 'wipe-up', durationInFrames: 15, parameters: {} };
    const upMarkup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ id: 'incoming', transitionIn: up })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(upMarkup).toContain('&quot;clipPath&quot;:&quot;inset(0 0 100% 0)&quot;');

    const down = { id: 't', kind: 'wipe-down', durationInFrames: 15, parameters: {} };
    const downMarkup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ id: 'incoming', transitionIn: down })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(downMarkup).toContain('&quot;clipPath&quot;:&quot;inset(100% 0 0 0)&quot;');
  });

  it('scales the incoming clip for zoom-in while still crossfading', () => {
    const transition = { id: 't', kind: 'zoom-in', durationInFrames: 15, parameters: {} };
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[clip({ id: 'incoming', transitionIn: transition })]}
        subtitles={[]}
        settings={SETTINGS}
      />,
    );
    expect(markup).toContain('scale(1.15, 1.15)');
    expect(markup).toContain('&quot;opacity&quot;:0');
  });

  it('renders resolved subtitle cues above media', () => {
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[]}
        subtitles={[
          {
            id: 'caption-a',
            startFrame: 0,
            durationInFrames: 30,
            text: 'Hello world',
            words: [],
            style: SUBTITLE_STYLE,
          },
        ]}
        settings={SETTINGS}
      />,
    );
    expect(markup).toContain('Hello world');
  });

  it('renders professional subtitle appearance and transforms without fallbacks', () => {
    const markup = renderToStaticMarkup(
      <VideoDipComposition
        clips={[]}
        subtitles={[
          {
            id: 'styled-caption',
            startFrame: 0,
            durationInFrames: 30,
            text: 'Styled',
            words: [],
            style: {
              ...SUBTITLE_STYLE,
              opacity: 0.8,
              backgroundOpacity: 0.5,
              strokeColor: '#ff00aa',
              strokeWidth: 3,
              shadowOpacity: 0.6,
              shadowBlur: 12,
              shadowOffsetX: 4,
              shadowOffsetY: 6,
              rotation: 12,
              scale: 1.25,
            },
          },
        ]}
        settings={SETTINGS}
      />,
    );

    expect(markup).toContain('rotate(12deg) scale(1.25)');
    expect(markup).toContain('-webkit-text-stroke:3px #ff00aa');
    expect(markup).toContain('rgba(0, 0, 0, 0.5)');
    expect(markup).toContain('text-shadow:4px 6px 12px rgba(0, 0, 0, 0.6)');
  });

  it('slides the caption in from below or above for slide-up and slide-down', () => {
    const subtitle = (animation: 'slide-up' | 'slide-down') => ({
      id: 'caption-a',
      startFrame: 0,
      durationInFrames: 30,
      text: 'Hello',
      words: [],
      style: { ...SUBTITLE_STYLE, animation },
    });

    const upMarkup = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('slide-up')]} settings={SETTINGS} />,
    );
    expect(upMarkup).toContain('calc(-50% + 24px)');

    const downMarkup = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('slide-down')]} settings={SETTINGS} />,
    );
    expect(downMarkup).toContain('calc(-50% + -24px)');
  });

  it('slides the caption in horizontally for slide-left and slide-right', () => {
    const subtitle = (animation: 'slide-left' | 'slide-right') => ({
      id: 'caption-a',
      startFrame: 0,
      durationInFrames: 30,
      text: 'Hello',
      words: [],
      style: { ...SUBTITLE_STYLE, animation },
    });

    const leftMarkup = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('slide-left')]} settings={SETTINGS} />,
    );
    expect(leftMarkup).toContain('translate(calc(-50% + 24px)');

    const rightMarkup = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('slide-right')]} settings={SETTINGS} />,
    );
    expect(rightMarkup).toContain('translate(calc(-50% + -24px)');
  });

  it('oscillates scale for bounce, distinctly from the fixed pop curve', () => {
    const subtitle = (animation: 'pop' | 'bounce') => ({
      id: 'caption-a',
      startFrame: 0,
      durationInFrames: 30,
      text: 'Hello',
      words: [],
      style: { ...SUBTITLE_STYLE, animation },
    });

    mockFrame.current = 3;
    const bounceMarkup = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('bounce')]} settings={SETTINGS} />,
    );
    const popMarkup = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('pop')]} settings={SETTINGS} />,
    );
    // entrance = 3/6 = 0.5: bounce -> 1 + sin(pi) * 0.5 * 0.25 = 1; pop -> 0.9.
    // Distinguish the curves at a frame where they would otherwise coincide.
    expect(bounceMarkup).toContain('scale(1)');
    expect(popMarkup).toContain('scale(0.9)');

    mockFrame.current = 1;
    const bounceEarly = renderToStaticMarkup(
      <VideoDipComposition clips={[]} subtitles={[subtitle('bounce')]} settings={SETTINGS} />,
    );
    // entrance = 1/6: sin((1/6)*2*pi) * (5/6) * 0.25 > 0, so bounce overshoots past 1.
    expect(bounceEarly).not.toContain('scale(1)');
  });
});
