'use client';

import { cn } from '@videodip/ui';
import { Video } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface SourceVideoThumbnailProps {
  /** Browser-resolvable locator for the original imported video. */
  readonly source: string;
  /** Reports whether the platform decoder has produced a visible frame. */
  readonly onFrameAvailabilityChange?: (isAvailable: boolean) => void;
  /** Layout-owned sizing; decoding and fallback behavior remain unchanged. */
  readonly className?: string;
}

/**
 * Displays a decoded frame from an imported video when a cached FFmpeg
 * thumbnail is not ready. This is a visual fallback only; generated artifacts
 * remain the durable, cheap path used once available.
 */
export function SourceVideoThumbnail({
  source,
  onFrameAvailabilityChange,
  className,
}: SourceVideoThumbnailProps) {
  const [hasLoadedFrame, setHasLoadedFrame] = useState(false);

  useEffect(() => setHasLoadedFrame(false), [source]);

  return (
    <span
      data-source-thumbnail-state={hasLoadedFrame ? 'ready' : 'loading'}
      className={cn(
        'bg-surface-inset relative h-9 w-14 shrink-0 overflow-hidden rounded-sm',
        className,
      )}
    >
      <video
        src={source}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden="true"
        className="size-full object-cover"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) {
            event.currentTarget.currentTime = Math.min(duration / 2, 1);
          }
        }}
        onLoadedData={() => {
          setHasLoadedFrame(true);
          onFrameAvailabilityChange?.(true);
        }}
        onError={() => {
          setHasLoadedFrame(false);
          onFrameAvailabilityChange?.(false);
        }}
      />
      <span
        className={cn(
          'pointer-events-none absolute inset-0 grid place-items-center',
          'bg-surface-inset transition-opacity duration-(--duration-fast)',
          hasLoadedFrame ? 'opacity-0' : 'opacity-100',
        )}
      >
        <Video className="text-text-tertiary size-4" aria-hidden="true" />
      </span>
    </span>
  );
}
