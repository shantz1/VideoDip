'use client';

import type { MediaItem } from '@videodip/media-engine';
import { ms } from '@videodip/shared';
import { Button, cn } from '@videodip/ui';
import { Grid3x3, Maximize2, Music, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore, type AspectRatio } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import { formatTimecode } from '../lib/timecode';
import { PreviewPlayer } from './preview-player';
import { ClipPreviewOverlay } from './clip-preview-overlay';
import { SubtitlePreviewOverlay } from './subtitle-preview-overlay';

/**
 * CSS `aspect-ratio` values, not Tailwind classes.
 *
 * A dynamically interpolated `aspect-[${w}/${h}]` class would not be picked up
 * by Tailwind's static build-time scanner — it only sees literal strings in
 * source. Inline style is the correct escape hatch here, same as the original
 * hardcoded value: this is layout geometry, not a themeable design token.
 */
const ASPECT_RATIO_CSS: Record<AspectRatio, string> = {
  '9:16': '9 / 16',
  '3:4': '3 / 4',
  '4:5': '4 / 5',
  '1:1': '1 / 1',
  '16:9': '16 / 9',
};

/**
 * The video preview.
 *
 * The stage hosts `PreviewPlayer` — `@remotion/player` driving
 * `@videodip/renderer`'s composition from the live timeline document. The
 * composition itself lives in `apps/renderer` so headless export renders the
 * exact same component; only the player chrome is desktop-specific.
 */
export function PreviewCanvas() {
  return (
    <main className="bg-surface-sunken flex h-full min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Stage />
      </div>
      <TransportBar />
    </main>
  );
}

function Stage() {
  const aspectRatio = useEditorStore((s) => s.aspectRatio);
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const mediaPreviewAssetId = useEditorStore((s) => s.mediaPreviewAssetId);
  const setMediaPreview = useEditorStore((s) => s.setMediaPreview);
  const { resolveMediaSource } = useEditorHost();
  const mediaPreview = mediaItems.find((item) => item.id === mediaPreviewAssetId);

  return (
    <div
      data-preview-stage
      className={cn(
        // max-w-full alongside h-full/max-h-full lets the browser's native
        // aspect-ratio containment shrink whichever axis is over-constrained
        // — needed once 16:9 can appear in a portrait-shaped window.
        'relative h-full max-h-full max-w-full overflow-hidden',
        'bg-canvas ring-border-subtle shadow-lg ring-1',
      )}
      style={{ aspectRatio: ASPECT_RATIO_CSS[aspectRatio], containerType: 'size' }}
    >
      <div className="absolute inset-0">
        {mediaPreview === undefined ? (
          <PreviewPlayer />
        ) : (
          <MediaSourcePreview
            item={mediaPreview}
            source={resolveMediaSource(mediaPreview.locator)}
            onClose={() => setMediaPreview(null)}
          />
        )}
      </div>
      {mediaPreview === undefined && <ClipPreviewOverlay />}
      {mediaPreview === undefined && <SubtitlePreviewOverlay />}
      <InstagramSafeGrid />
    </div>
  );
}

function MediaSourcePreview({
  item,
  source,
  onClose,
}: {
  readonly item: MediaItem;
  readonly source: string;
  readonly onClose: () => void;
}) {
  return (
    <div className="bg-canvas relative size-full">
      {item.kind === 'video' ? (
        <video
          src={source}
          autoPlay
          controls
          playsInline
          aria-label={`Previewing ${item.name}`}
          className="size-full object-contain"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-4 p-6">
          <Music className="text-text-tertiary size-12" aria-hidden="true" />
          <p className="text-text-primary max-w-full truncate text-sm font-medium">{item.name}</p>
          <audio src={source} autoPlay controls aria-label={`Previewing ${item.name}`} />
        </div>
      )}
      <div className="absolute top-2 right-2 left-2 flex items-center justify-between gap-2">
        <span className="bg-surface-overlay text-text-primary min-w-0 truncate px-2 py-1 text-xs shadow-sm">
          Source preview · {item.name}
        </span>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Return to timeline preview"
          className="shrink-0 shadow-sm"
          onClick={onClose}
          leadingIcon={<X />}
        />
      </div>
    </div>
  );
}

function InstagramSafeGrid() {
  const isEnabled = useEditorStore((state) => state.isInstagramSafeGridEnabled);
  if (!isEnabled) return null;

  return (
    <div
      data-instagram-safe-grid="visible"
      className="pointer-events-none absolute inset-0 z-30"
      aria-hidden="true"
    >
      <div
        className="border-warning absolute grid grid-cols-3 grid-rows-3 border"
        style={{ inset: '10%', borderColor: 'var(--color-warning)' }}
      >
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className={cn('opacity-40', index % 3 !== 2 && 'border-r', index < 6 && 'border-b')}
            style={{ borderColor: 'var(--color-warning)' }}
          />
        ))}
        <span className="bg-surface-overlay text-warning text-2xs absolute top-1 left-1 px-1 py-0.5 shadow-sm">
          Instagram safe area
        </span>
      </div>
    </div>
  );
}

function TransportBar() {
  const { toggleFullscreen } = useEditorHost();
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const playhead = useEditorStore((s) => s.playhead);
  const duration = useEditorStore((s) => s.duration);
  const togglePlayback = useEditorStore((s) => s.togglePlayback);
  const seek = useEditorStore((s) => s.seek);
  const mediaPreviewAssetId = useEditorStore((s) => s.mediaPreviewAssetId);
  const isInstagramSafeGridEnabled = useEditorStore((s) => s.isInstagramSafeGridEnabled);
  const toggleInstagramSafeGrid = useEditorStore((s) => s.toggleInstagramSafeGrid);
  const [isChangingFullscreen, setIsChangingFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  const handleFullscreen = () => {
    setFullscreenError(null);
    setIsChangingFullscreen(true);
    void toggleFullscreen().then((result) => {
      if (!result.ok) setFullscreenError(result.error.recovery);
      setIsChangingFullscreen(false);
    });
  };

  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center justify-center gap-2 px-3',
        'border-border-subtle bg-surface-base border-t',
      )}
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Go to start"
        disabled={mediaPreviewAssetId !== null}
        onClick={() => seek(ms(0))}
        leadingIcon={<SkipBack />}
      />
      <Button
        size="icon"
        variant="secondary"
        // The label must describe the action, not the state — a button reading
        // "Play" while playing is what a screen reader would announce.
        aria-label={isPlaying ? 'Pause' : 'Play'}
        disabled={duration === 0 || mediaPreviewAssetId !== null}
        onClick={togglePlayback}
        leadingIcon={isPlaying ? <Pause /> : <Play />}
      />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Go to end"
        disabled={mediaPreviewAssetId !== null}
        onClick={() => seek(duration)}
        leadingIcon={<SkipForward />}
      />

      <div className="ml-3 flex items-baseline gap-1 font-mono text-xs tabular-nums">
        <span className="text-text-primary">{formatTimecode(playhead)}</span>
        <span className="text-text-tertiary">/ {formatTimecode(duration)}</span>
      </div>

      <Button
        size="icon-sm"
        variant={isInstagramSafeGridEnabled ? 'secondary' : 'ghost'}
        className="ml-auto"
        aria-label="Toggle Instagram safe grid"
        aria-pressed={isInstagramSafeGridEnabled}
        title={isInstagramSafeGridEnabled ? 'Hide Instagram safe grid' : 'Show Instagram safe grid'}
        onClick={toggleInstagramSafeGrid}
        leadingIcon={<Grid3x3 />}
      />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Fullscreen"
        loading={isChangingFullscreen}
        onClick={handleFullscreen}
        leadingIcon={<Maximize2 />}
      />
      {fullscreenError && (
        <span role="alert" className="sr-only">
          {fullscreenError}
        </span>
      )}
    </div>
  );
}
