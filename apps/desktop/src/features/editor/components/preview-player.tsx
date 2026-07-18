'use client';

import { Player, type PlayerRef } from '@remotion/player';
import { framesToMs, msToFrames, type AssetId } from '@videodip/shared';
import { getDuration } from '@videodip/timeline';
import { VideoDipComposition } from '@videodip/renderer';
import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore, type AspectRatio } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import {
  PROJECT_FPS,
  toCompositionClips,
  toCompositionSubtitles,
} from '../lib/composition-adapter';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';

/**
 * Composition pixel dimensions per aspect ratio.
 *
 * 1080 on the short edge across the board — the standard short-form delivery
 * size. Becomes a project-level export setting later; the preview only needs
 * the ratio to be right.
 */
const COMPOSITION_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '3:4': { width: 1080, height: 1440 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

/**
 * The real preview: `@remotion/player` rendering `@videodip/renderer`'s
 * composition from the live timeline document.
 *
 * Transport stays owned by the editor store — the TransportBar's buttons and
 * the timeline ruler were already wired to `isPlaying`/`playhead`, so this
 * component syncs those into the Player imperatively rather than mounting a
 * second, competing set of controls:
 *
 * - store `isPlaying` → `player.play()/pause()`
 * - store `playhead`  → `player.seekTo()`, only when they disagree by more
 *   than a frame — the frame-update listener below writes player time back
 *   into the store, and without that tolerance the two effects feed each
 *   other forever.
 * - player `frameupdate` → store `seek()`, so the playhead line in the
 *   timeline tracks playback.
 * - player `ended` → store `pause()`, so the play button doesn't stay stuck
 *   showing "pause" after playback finishes.
 */
export function PreviewPlayer() {
  const playerRef = useRef<PlayerRef>(null);
  const { resolveMediaSource } = useEditorHost();

  const documentValue = useProjectStore((s) => s.document);
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const aspectRatio = useEditorStore((s) => s.aspectRatio);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const playhead = useEditorStore((s) => s.playhead);
  const seek = useEditorStore((s) => s.seek);
  const pause = useEditorStore((s) => s.pause);

  const clips = useMemo(() => {
    const mediaByAsset = new Map(mediaItems.map((item) => [item.id, item]));
    const resolveAsset = (assetId: AssetId) => {
      const item = mediaByAsset.get(assetId);
      if (item === undefined) return undefined;
      // A raw OS path is not a loadable URL inside a webview; Tauri's asset
      // protocol makes it one. Outside Tauri there is no equivalent — the
      // path passes through and simply fails to load, which is fine: media
      // can only be imported inside the Tauri shell anyway.
      return {
        src: resolveMediaSource(item.locator),
        mediaKind: item.kind,
      };
    };
    return toCompositionClips(documentValue, resolveAsset);
  }, [documentValue, mediaItems, resolveMediaSource]);

  const subtitleDuration = subtitleDocument.segments.at(-1)?.end ?? 0;
  const durationInFrames = Math.max(
    1,
    msToFrames(Math.max(getDuration(documentValue), subtitleDuration) as never, PROJECT_FPS),
  );
  const subtitles = useMemo(() => toCompositionSubtitles(subtitleDocument), [subtitleDocument]);

  // store.isPlaying → player transport.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.play();
    else player.pause();
  }, [isPlaying]);

  // store.playhead → player position, with a one-frame tolerance to break
  // the loop with the frameupdate listener below.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const targetFrame = msToFrames(playhead, PROJECT_FPS);
    if (Math.abs(player.getCurrentFrame() - targetFrame) > 1) {
      player.seekTo(targetFrame);
    }
  }, [playhead]);

  // player position → store.playhead; player end → store.pause.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate = (event: { detail: { frame: number } }) => {
      seek(framesToMs(event.detail.frame as never, PROJECT_FPS));
    };
    const onEnded = () => pause();

    player.addEventListener('frameupdate', onFrameUpdate);
    player.addEventListener('ended', onEnded);
    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('ended', onEnded);
    };
  }, [seek, pause]);

  const { width, height } = COMPOSITION_SIZE[aspectRatio];
  const settings = useMemo(
    () => ({ fps: PROJECT_FPS, width, height, durationInFrames }),
    [width, height, durationInFrames],
  );
  const inputProps = useMemo(() => ({ clips, subtitles, settings }), [clips, subtitles, settings]);

  return (
    <Player
      ref={playerRef}
      component={VideoDipComposition}
      inputProps={inputProps}
      durationInFrames={settings.durationInFrames}
      fps={settings.fps}
      compositionWidth={settings.width}
      compositionHeight={settings.height}
      style={{ width: '100%', height: '100%' }}
      controls={false}
      acknowledgeRemotionLicense
    />
  );
}
