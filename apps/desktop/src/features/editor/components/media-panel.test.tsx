import { createMediaItem } from '@videodip/media-engine';
import { mediaLocatorSchema, ms, ok } from '@videodip/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { MediaPanel } from './left-sidebar';

const host = vi.hoisted(() => ({
  getMediaArtifact: vi.fn(),
  importMedia: vi.fn(),
  resolveMediaSource: vi.fn((locator: string) => `resolved:${locator}`),
}));

vi.mock('../host/editor-host', () => ({ useEditorHost: () => host }));

const initialEditor = useEditorStore.getState();
const video = createMediaItem({
  locator: mediaLocatorSchema.parse('asset://square-grid.mp4'),
  name: 'square-grid.mp4',
  kind: 'video',
  duration: ms(60_000),
});

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useEditorStore.setState({ mediaItems: [video] });
  host.getMediaArtifact.mockReset();
  host.getMediaArtifact.mockImplementation(() => new Promise(() => undefined));
  host.importMedia.mockReset();
  host.importMedia.mockResolvedValue(ok([]));
});

describe('MediaPanel views', () => {
  it('switches between square grid cards and compact list rows', () => {
    const view = render(<MediaPanel />);

    expect(view.container.querySelector('[data-media-library-view="grid"]')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Grid view' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const sourceThumbnail = view.container.querySelector('[data-source-thumbnail-state]');
    expect(sourceThumbnail?.parentElement).toHaveAttribute('data-media-thumbnail-shape', 'square');
    expect(sourceThumbnail?.parentElement).toHaveClass('aspect-square', 'overflow-hidden');
    expect(sourceThumbnail).toHaveClass('size-full', 'object-cover');

    fireEvent.click(screen.getByRole('radio', { name: 'List view' }));

    expect(view.container.querySelector('[data-media-library-view="list"]')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'List view' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(view.container.querySelector('[data-source-thumbnail-state]')).toHaveClass('h-9');
  });

  it('places Preview immediately before Add and stops timeline playback', () => {
    useEditorStore.getState().play();
    render(<MediaPanel />);

    const preview = screen.getByRole('button', { name: 'Preview square-grid.mp4' });
    const add = screen.getByRole('button', { name: 'Add square-grid.mp4 to the timeline' });
    expect(preview.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    fireEvent.click(preview);
    expect(useEditorStore.getState().mediaPreviewAssetId).toBe(video.id);
    expect(useEditorStore.getState().isPlaying).toBe(false);
    expect(preview).toHaveAttribute('aria-pressed', 'true');
  });
});
