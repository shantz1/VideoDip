import { fps, msToFrames, type AssetId, type Fps } from '@videodip/shared';
import type { TimelineDocument } from '@videodip/timeline';
import type { CompositionClip } from '@videodip/renderer';

/**
 * PLACEHOLDER project frame rate.
 *
 * Becomes a per-project setting once the project manager exists. 30 is the
 * short-form default everywhere our target users publish.
 */
export const PROJECT_FPS: Fps = fps(30);

/**
 * Converts the timeline document into the flat clip list the Remotion
 * composition consumes.
 *
 * `resolveSrc` is injected rather than imported: turning an `AssetId` into a
 * loadable URL is environment-specific (Tauri's `convertFileSrc` in the
 * desktop shell, nothing meaningful in a plain browser tab, a raw path in
 * headless export). Injecting it keeps this function pure and testable with
 * no Tauri alive, per the constitution's testing rule.
 *
 * Clips whose asset can't be resolved are dropped rather than passed through
 * as broken `<Video>` elements — a missing source would otherwise surface as
 * a Remotion load error deep inside the player instead of simply not
 * rendering.
 */
export function toCompositionClips(
  document: TimelineDocument,
  resolveSrc: (assetId: AssetId) => string | undefined,
  frameRate: Fps = PROJECT_FPS,
): readonly CompositionClip[] {
  const clips: CompositionClip[] = [];

  for (const track of document.tracks) {
    for (const clip of track.clips) {
      const src = resolveSrc(clip.assetId);
      if (src === undefined) continue;

      clips.push({
        id: clip.id,
        kind: track.kind,
        src,
        startFrame: msToFrames(clip.start, frameRate),
        durationInFrames: Math.max(1, msToFrames(clip.duration, frameRate)),
        sourceStartFrame: msToFrames(clip.sourceStart, frameRate),
      });
    }
  }

  return clips;
}
