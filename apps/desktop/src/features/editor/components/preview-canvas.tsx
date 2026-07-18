'use client';

import { ms } from '@videodip/shared';
import { Button, cn } from '@videodip/ui';
import { Maximize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore, type AspectRatio } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import { formatTimecode } from '../lib/timecode';
import { PreviewPlayer } from './preview-player';
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

  return (
    <div
      className={cn(
        // max-w-full alongside h-full/max-h-full lets the browser's native
        // aspect-ratio containment shrink whichever axis is over-constrained
        // — needed once 16:9 can appear in a portrait-shaped window.
        'relative h-full max-h-full max-w-full overflow-hidden rounded-lg',
        'bg-canvas ring-border-subtle shadow-lg ring-1',
      )}
      style={{ aspectRatio: ASPECT_RATIO_CSS[aspectRatio], containerType: 'size' }}
    >
      <div className="absolute inset-0">
        <PreviewPlayer />
      </div>
      <SubtitlePreviewOverlay />
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
        onClick={() => seek(ms(0))}
        leadingIcon={<SkipBack />}
      />
      <Button
        size="icon"
        variant="secondary"
        // The label must describe the action, not the state — a button reading
        // "Play" while playing is what a screen reader would announce.
        aria-label={isPlaying ? 'Pause' : 'Play'}
        disabled={duration === 0}
        onClick={togglePlayback}
        leadingIcon={isPlaying ? <Pause /> : <Play />}
      />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Go to end"
        onClick={() => seek(duration)}
        leadingIcon={<SkipForward />}
      />

      <div className="ml-3 flex items-baseline gap-1 font-mono text-xs tabular-nums">
        <span className="text-text-primary">{formatTimecode(playhead)}</span>
        <span className="text-text-tertiary">/ {formatTimecode(duration)}</span>
      </div>

      <Button
        size="icon-sm"
        variant="ghost"
        className="ml-auto"
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
