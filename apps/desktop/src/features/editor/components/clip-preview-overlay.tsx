'use client';

import { getSelectedClipId, type Clip, type ClipTransform } from '@videodip/timeline';
import { cn } from '@videodip/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useEditorStore } from '../editor.store';
import { COMPOSITION_SIZE } from '../lib/composition-size';
import {
  containedMediaSize,
  moveClipPreviewTransform,
  resizeClipPreviewTransform,
} from '../lib/clip-preview-transform';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';

interface MoveInteraction {
  readonly kind: 'move';
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly transform: ClipTransform;
}

interface ResizeInteraction {
  readonly kind: 'resize';
  readonly pointerId: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly initialDistance: number;
  readonly transform: ClipTransform;
}

type ClipInteraction = MoveInteraction | ResizeInteraction;

const KEY_POSITION_STEP = 0.01;
const KEY_SCALE_STEP = 0.05;

/** Direct manipulation layer for the selected, visible video clip. */
export function ClipPreviewOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<ClipInteraction | null>(null);
  const document = useProjectStore((state) => state.document);
  const updateClipProperties = useProjectStore((state) => state.updateClipProperties);
  const selectedClipId = useSessionStore((state) => getSelectedClipId(state.session));
  const transformPreview = useSessionStore((state) => state.session.clipTransformPreview);
  const previewClipTransform = useSessionStore((state) => state.previewClipTransform);
  const clearClipTransformPreview = useSessionStore((state) => state.clearClipTransformPreview);
  const isSnappingEnabled = useSessionStore((state) => state.session.viewport.isSnappingEnabled);
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const playhead = useEditorStore((state) => state.playhead);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);
  const pause = useEditorStore((state) => state.pause);
  const [guides, setGuides] = useState<{ vertical: number | null; horizontal: number | null }>({
    vertical: null,
    horizontal: null,
  });
  const [error, setError] = useState<string | null>(null);

  const clip = selectedClipId
    ? document.tracks
        .flatMap((track) => track.clips)
        .find((candidate) => candidate.id === selectedClipId)
    : undefined;
  const media = clip ? mediaItems.find((item) => item.id === clip.assetId) : undefined;
  const isVisible =
    clip !== undefined &&
    clip.isEnabled &&
    playhead >= clip.start &&
    playhead < clip.start + clip.duration;
  const hasAnimatedTransform = clip?.animation.some((keyframe) => keyframe.property !== 'opacity');

  useEffect(
    () => () => {
      clearClipTransformPreview();
    },
    [clearClipTransformPreview, selectedClipId],
  );

  if (!clip || media?.kind !== 'video' || !isVisible || hasAnimatedTransform) return null;

  const effectiveTransform =
    transformPreview?.clipId === clip.id ? transformPreview.transform : clip.transform;
  const frame = COMPOSITION_SIZE[aspectRatio];
  const videoStream = media.metadata?.streams.find(
    (stream) =>
      stream.kind === 'video' && stream.width !== undefined && stream.height !== undefined,
  );
  const contained = containedMediaSize(
    frame.width,
    frame.height,
    videoStream?.width,
    videoStream?.height,
  );

  const commitPreview = () => {
    const preview = useSessionStore.getState().session.clipTransformPreview;
    if (preview?.clipId !== clip.id) return;
    const result = updateClipProperties(clip.id, { transform: preview.transform });
    clearClipTransformPreview();
    setError(result.ok ? null : result.error.recovery);
  };

  const finishInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setGuides({ vertical: null, horizontal: null });
    commitPreview();
  };

  const cancelInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setGuides({ vertical: null, horizontal: null });
    clearClipTransformPreview();
  };

  const startMove = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    pause();
    setInspectorTab('transform');
    setError(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      transform: effectiveTransform,
    };
  };

  const movePointer = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    const root = rootRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !root) return;
    if (interaction.kind === 'move') {
      const bounds = root.getBoundingClientRect();
      const moved = moveClipPreviewTransform(
        interaction.transform,
        event.clientX - interaction.clientX,
        event.clientY - interaction.clientY,
        bounds.width,
        bounds.height,
        isSnappingEnabled,
      );
      previewClipTransform(clip.id, moved.transform);
      setGuides({ vertical: moved.verticalGuide, horizontal: moved.horizontalGuide });
      return;
    }
    const distance = Math.hypot(
      event.clientX - interaction.centerX,
      event.clientY - interaction.centerY,
    );
    previewClipTransform(
      clip.id,
      resizeClipPreviewTransform(interaction.transform, interaction.initialDistance, distance),
    );
  };

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    pause();
    setInspectorTab('transform');
    setError(null);
    const bounds = root.getBoundingClientRect();
    const centerX = bounds.left + bounds.width * (0.5 + effectiveTransform.positionX);
    const centerY = bounds.top + bounds.height * (0.5 + effectiveTransform.positionY);
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      centerX,
      centerY,
      initialDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      transform: effectiveTransform,
    };
  };

  const keyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    const multiplier = event.shiftKey ? 5 : 1;
    const delta = KEY_POSITION_STEP * multiplier;
    const offsets: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const result = updateClipProperties(clip.id, {
      transform: {
        positionX: effectiveTransform.positionX + offset[0],
        positionY: effectiveTransform.positionY + offset[1],
      },
    });
    setError(result.ok ? null : result.error.recovery);
  };

  const keyboardResize = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const grows = event.key === 'ArrowUp' || event.key === 'ArrowRight';
    const delta = KEY_SCALE_STEP * (event.shiftKey ? 5 : 1) * (grows ? 1 : -1);
    const result = updateClipProperties(clip.id, {
      transform: {
        scaleX: Math.max(0.05, effectiveTransform.scaleX + delta),
        scaleY: Math.max(0.05, effectiveTransform.scaleY + delta),
      },
    });
    setError(result.ok ? null : result.error.recovery);
  };

  return (
    <div ref={rootRef} data-clip-preview-root className="pointer-events-none absolute inset-0 z-10">
      {guides.vertical !== null && (
        <div
          className="bg-accent pointer-events-none absolute top-0 bottom-0 w-px"
          style={{ left: `${guides.vertical * 100}%` }}
        />
      )}
      {guides.horizontal !== null && (
        <div
          className="bg-accent pointer-events-none absolute right-0 left-0 h-px"
          style={{ top: `${guides.horizontal * 100}%` }}
        />
      )}
      <div
        className="border-accent pointer-events-none absolute border"
        style={{
          left: `calc(50% + ${effectiveTransform.positionX * 100}%)`,
          top: `calc(50% + ${effectiveTransform.positionY * 100}%)`,
          width: `${contained.width * 100}%`,
          height: `${contained.height * 100}%`,
          transform: `translate(-50%, -50%) rotate(${effectiveTransform.rotation}deg) scale(${effectiveTransform.scaleX}, ${effectiveTransform.scaleY})`,
          transformOrigin: 'center',
        }}
      >
        <button
          type="button"
          aria-label={`Move video: ${media.name}`}
          onPointerDown={startMove}
          onPointerMove={movePointer}
          onPointerUp={finishInteraction}
          onPointerCancel={cancelInteraction}
          onKeyDown={keyboardMove}
          className={cn(
            'pointer-events-auto absolute inset-0 cursor-move',
            'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
          )}
        />
        {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label={`Resize video from ${corner.replace('-', ' ')}`}
            onPointerDown={startResize}
            onPointerMove={movePointer}
            onPointerUp={finishInteraction}
            onPointerCancel={cancelInteraction}
            onKeyDown={keyboardResize}
            className={cn(
              'border-accent bg-surface-base pointer-events-auto absolute size-3 rounded-full border',
              'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
              corner === 'top-left' && '-top-1.5 -left-1.5 cursor-nwse-resize',
              corner === 'top-right' && '-top-1.5 -right-1.5 cursor-nesw-resize',
              corner === 'bottom-left' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
              corner === 'bottom-right' && '-right-1.5 -bottom-1.5 cursor-nwse-resize',
            )}
          />
        ))}
      </div>
      {error && (
        <span
          role="alert"
          className="bg-danger-subtle text-danger absolute bottom-2 left-2 rounded-md px-2 py-1 text-xs"
        >
          {error}
        </span>
      )}
    </div>
  );
}
