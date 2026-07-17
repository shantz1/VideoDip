import { fps, ms, msToFrames, type AssetId, type Fps, type MediaKind } from '@videodip/shared';
import type { TimelineDocument } from '@videodip/timeline';
import type { CompositionClip } from '@videodip/renderer';
import type { SubtitleDocument } from '@videodip/subtitle-engine';
import type { CompositionSubtitle } from '@videodip/renderer';

/**
 * PLACEHOLDER project frame rate.
 *
 * Becomes a per-project setting once the project manager exists. 30 is the
 * short-form default everywhere our target users publish.
 */
export const PROJECT_FPS: Fps = fps(30);

export interface ResolvedCompositionAsset {
  readonly src: string;
  readonly mediaKind: MediaKind;
}

/**
 * Converts the timeline document into the flat clip list the Remotion
 * composition consumes.
 *
 * `resolveAsset` is injected rather than imported: turning an `AssetId` into
 * a loadable URL is environment-specific. It also supplies the asset media
 * kind, which is distinct from open track metadata: a plugin overlay track
 * can still contain an ordinary video asset.
 *
 * Clips whose asset can't be resolved are dropped rather than passed through
 * as broken `<Video>` elements — a missing source would otherwise surface as
 * a Remotion load error deep inside the player instead of simply not
 * rendering.
 */
export function toCompositionClips(
  document: TimelineDocument,
  resolveAsset: (assetId: AssetId) => ResolvedCompositionAsset | undefined,
  frameRate: Fps = PROJECT_FPS,
): readonly CompositionClip[] {
  const clips: CompositionClip[] = [];

  // Timeline order is top-to-bottom; Remotion layers later visual elements on
  // top, so flatten from the bottom track upward. This preserves arbitrary
  // overlay/plugin kinds without a hard-coded kind ranking.
  for (const track of [...document.tracks].reverse()) {
    for (const clip of track.clips) {
      const asset = resolveAsset(clip.assetId);
      if (asset === undefined) continue;

      clips.push({
        id: clip.id,
        trackKind: track.kind,
        mediaKind: asset.mediaKind,
        src: asset.src,
        startFrame: msToFrames(clip.start, frameRate),
        durationInFrames: Math.max(1, msToFrames(clip.duration, frameRate)),
        sourceStartFrame: msToFrames(clip.sourceStart, frameRate),
        transform: clip.transform,
        opacity: clip.opacity,
        blendMode: clip.blendMode,
        isEnabled: clip.isEnabled,
        animation: clip.animation.map((keyframe) => ({
          property: keyframe.property,
          frame: msToFrames(keyframe.offset, frameRate),
          value: keyframe.value,
          easing: keyframe.easing,
        })),
        audio: {
          volume: clip.audio.volume,
          isMuted: clip.audio.isMuted,
          fadeInFrames: msToFrames(clip.audio.fadeIn, frameRate),
          fadeOutFrames: msToFrames(clip.audio.fadeOut, frameRate),
        },
      });
    }
  }

  return clips;
}

/** Resolves editable millisecond subtitle cues into the shared frame contract. */
export function toCompositionSubtitles(
  document: SubtitleDocument,
  frameRate: Fps = PROJECT_FPS,
): readonly CompositionSubtitle[] {
  return document.segments.map((segment) => ({
    id: segment.id,
    startFrame: msToFrames(segment.start, frameRate),
    durationInFrames: Math.max(1, msToFrames(ms(segment.end - segment.start), frameRate)),
    text: segment.text,
    words: segment.words.map((word) => ({
      id: word.id,
      text: word.text,
      startFrame: Math.max(0, msToFrames(ms(word.start - segment.start), frameRate)),
      endFrame: Math.max(1, msToFrames(ms(word.end - segment.start), frameRate)),
    })),
    style: { ...document.defaultStyle, ...segment.style },
  }));
}
