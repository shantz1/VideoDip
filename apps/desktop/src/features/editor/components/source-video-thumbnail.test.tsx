import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceVideoThumbnail } from './source-video-thumbnail';

describe('SourceVideoThumbnail', () => {
  it('uses the imported source while a generated thumbnail is unavailable', () => {
    const onFrameAvailabilityChange = vi.fn();
    const view = render(
      <SourceVideoThumbnail
        source="asset://video.mp4"
        onFrameAvailabilityChange={onFrameAvailabilityChange}
      />,
    );
    const video = view.container.querySelector('video');
    const preview = view.container.querySelector('[data-source-thumbnail-state]');
    expect(video).toHaveAttribute('src', 'asset://video.mp4');
    expect(preview).toHaveAttribute('data-source-thumbnail-state', 'loading');

    if (!(video instanceof HTMLVideoElement)) throw new Error('Expected source video.');
    fireEvent.loadedData(video);
    expect(preview).toHaveAttribute('data-source-thumbnail-state', 'ready');
    expect(onFrameAvailabilityChange).toHaveBeenCalledWith(true);
  });

  it('seeks to an early representative frame after metadata loads', () => {
    const view = render(<SourceVideoThumbnail source="asset://video.mp4" />);
    const video = view.container.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) throw new Error('Expected source video.');
    Object.defineProperty(video, 'duration', { value: 8, configurable: true });

    fireEvent.loadedMetadata(video);

    expect(video.currentTime).toBe(1);
  });
});
