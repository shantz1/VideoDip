'use client';

import { ms } from '@videodip/shared';
import { Button, cn } from '@videodip/ui';
import { Maximize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEditorStore } from '../editor.store';
import { formatTimecode } from '../lib/timecode';

/**
 * The video preview.
 *
 * PLACEHOLDER: renders an empty canvas surface. The real player is a Remotion
 * `<Player>` driven by the timeline model. It stays behind this boundary so
 * that rendering remains independent of the UI, per `CLAUDE.md`.
 */
export function PreviewCanvas() {
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-sunken">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Stage />
      </div>
      <TransportBar />
    </main>
  );
}

function Stage() {
  return (
    <div
      className={cn(
        // 9:16 for short-form. Hardcoded until the project model carries an
        // aspect ratio; `aspect-[9/16]` is layout, not a design token.
        'relative aspect-[9/16] h-full max-h-full overflow-hidden rounded-lg',
        'bg-canvas shadow-lg ring-1 ring-border-subtle',
      )}
    >
      <div className="absolute inset-0 grid place-items-center">
        <p className="text-xs text-text-tertiary">Preview</p>
      </div>
    </div>
  );
}

function TransportBar() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const playhead = useEditorStore((s) => s.playhead);
  const duration = useEditorStore((s) => s.duration);
  const togglePlayback = useEditorStore((s) => s.togglePlayback);
  const seek = useEditorStore((s) => s.seek);

  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center justify-center gap-2 px-3',
        'border-t border-border-subtle bg-surface-base',
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
        leadingIcon={<Maximize2 />}
      />
    </div>
  );
}
