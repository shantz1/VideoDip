import { createMediaItem } from '@videodip/media-engine';
import { mediaLocatorSchema, ms, ok } from '@videodip/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { PreviewCanvas } from './preview-canvas';

const host = vi.hoisted(() => ({
  resolveMediaSource: vi.fn((locator: string) => `resolved:${locator}`),
  toggleFullscreen: vi.fn(async () => ok(true)),
}));

vi.mock('../host/editor-host', () => ({ useEditorHost: () => host }));
vi.mock('./preview-player', () => ({ PreviewPlayer: () => <div>Timeline composition</div> }));
vi.mock('./clip-preview-overlay', () => ({ ClipPreviewOverlay: () => null }));
vi.mock('./subtitle-preview-overlay', () => ({ SubtitlePreviewOverlay: () => null }));

const initialEditor = useEditorStore.getState();
const video = createMediaItem({
  locator: mediaLocatorSchema.parse('asset://audition.mp4'),
  name: 'audition.mp4',
  kind: 'video',
  duration: ms(10_000),
});

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useEditorStore.setState({ mediaItems: [video] });
});

describe('PreviewCanvas source audition and guides', () => {
  it('replaces the timeline with the selected media source and can return', () => {
    useEditorStore.getState().setMediaPreview(video.id);
    const view = render(<PreviewCanvas />);

    expect(screen.queryByText('Timeline composition')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Previewing audition.mp4')).toHaveAttribute(
      'src',
      'resolved:asset://audition.mp4',
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(view.container.querySelector('[data-preview-stage]')).not.toHaveClass('rounded-lg');

    fireEvent.click(screen.getByRole('button', { name: 'Return to timeline preview' }));
    expect(screen.getByText('Timeline composition')).toBeInTheDocument();
  });

  it('exposes an explicit on/off Instagram safe grid control', () => {
    const view = render(<PreviewCanvas />);
    const toggle = screen.getByRole('button', { name: 'Toggle Instagram safe grid' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(view.container.querySelector('[data-instagram-safe-grid]')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(view.container.querySelector('[data-instagram-safe-grid="visible"]')).not.toBeNull();
    expect(screen.getByText('Instagram safe area')).toBeInTheDocument();
  });
});
