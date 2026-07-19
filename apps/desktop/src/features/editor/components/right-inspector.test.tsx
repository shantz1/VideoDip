import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ms, type AssetId } from '@videodip/shared';
import { getSelectedTransitionId } from '@videodip/timeline';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { RightInspector } from './right-inspector';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const initialSession = useSessionStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
  useSessionStore.setState(initialSession, true);
});

describe('transition inspector', () => {
  it('edits and removes the selected cut transition', async () => {
    const project = useProjectStore.getState();
    project.addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as AssetId,
      start: ms(0),
      duration: ms(1000),
    });
    project.addClip({
      trackId: 'video' as never,
      assetId: 'asset-b' as AssetId,
      start: ms(1000),
      duration: ms(1000),
    });
    const [from, to] =
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video')?.clips ??
      [];
    if (!from || !to) throw new Error('Expected adjacent clips.');
    const added = useProjectStore.getState().addTransition({
      fromClipId: from.id,
      toClipId: to.id,
      kind: 'crossfade',
      duration: ms(500),
    });
    if (!added.ok) throw new Error(added.error.message);
    const transition = added.value.transitions[0];
    if (!transition) throw new Error('Expected a transition.');
    useSessionStore.getState().select({ type: 'transition', id: transition.id });
    useEditorStore.getState().setInspectorTab('effects');

    const user = userEvent.setup();
    render(createElement(RightInspector));

    expect(screen.getByText('Clip transition')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Wipe left' }));
    expect(useProjectStore.getState().document.transitions[0]?.kind).toBe('wipe-left');
    expect(screen.getByRole('radio', { name: 'Wipe left' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Remove transition' }));
    expect(useProjectStore.getState().document.transitions).toEqual([]);
    expect(getSelectedTransitionId(useSessionStore.getState().session)).toBeNull();
  });
});

describe('clip animation presets', () => {
  it('applies a continuous preset across the whole clip duration', async () => {
    const added = useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as AssetId,
      start: ms(0),
      duration: ms(2000),
    });
    if (!added.ok) throw new Error(added.error.message);
    const clip = added.value.tracks.find((track) => track.kind === 'video')?.clips[0];
    if (!clip) throw new Error('Expected a video clip.');
    useSessionStore.getState().select({ type: 'clip', id: clip.id });
    useEditorStore.getState().setInspectorTab('animation');

    const user = userEvent.setup();
    render(createElement(RightInspector));
    await user.click(screen.getByRole('button', { name: 'Zoom In (continuous)' }));

    const animated = useProjectStore
      .getState()
      .document.tracks.find((track) => track.kind === 'video')?.clips[0];
    expect(animated?.animation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'scaleX', offset: 0, value: 1 }),
        expect.objectContaining({ property: 'scaleX', offset: 2000, value: 1.15 }),
      ]),
    );
  });

  it('applying a second preset preserves keyframes on untouched properties', async () => {
    const added = useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as AssetId,
      start: ms(0),
      duration: ms(2000),
    });
    if (!added.ok) throw new Error(added.error.message);
    const clip = added.value.tracks.find((track) => track.kind === 'video')?.clips[0];
    if (!clip) throw new Error('Expected a video clip.');
    useSessionStore.getState().select({ type: 'clip', id: clip.id });
    useEditorStore.getState().setInspectorTab('animation');

    const user = userEvent.setup();
    render(createElement(RightInspector));
    await user.click(screen.getByRole('button', { name: 'Zoom In (continuous)' }));
    await user.click(screen.getByRole('button', { name: 'Slide In from Left (entrance)' }));

    const animated = useProjectStore
      .getState()
      .document.tracks.find((track) => track.kind === 'video')?.clips[0];
    const properties = animated?.animation.map((keyframe) => keyframe.property) ?? [];
    expect(properties).toContain('scaleX');
    expect(properties).toContain('scaleY');
    expect(properties).toContain('positionX');
  });
});

describe('continuous inspector controls', () => {
  it('uses sliders and creates one undo step when a drag is committed', () => {
    const added = useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as AssetId,
      start: ms(0),
      duration: ms(2000),
    });
    if (!added.ok) throw new Error(added.error.message);
    const clip = added.value.tracks.find((track) => track.kind === 'video')?.clips[0];
    if (!clip) throw new Error('Expected a video clip.');
    useSessionStore.getState().select({ type: 'clip', id: clip.id });
    useEditorStore.getState().setInspectorTab('transform');
    const historyBeforeDrag = useProjectStore.getState().past.length;

    render(createElement(RightInspector));

    const opacity = screen.getByRole('slider', { name: 'Opacity slider' });
    fireEvent.change(opacity, { target: { value: '40' } });
    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video')?.clips[0]
        ?.opacity,
    ).toBe(1);

    fireEvent.pointerUp(opacity);
    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video')?.clips[0]
        ?.opacity,
    ).toBe(0.4);
    expect(useProjectStore.getState().past).toHaveLength(historyBeforeDrag + 1);
  });
});

describe('locked track inspector', () => {
  it('explains the lock and disables selected clip controls', () => {
    const added = useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as AssetId,
      start: ms(0),
      duration: ms(2000),
    });
    if (!added.ok) throw new Error(added.error.message);
    const track = added.value.tracks.find((candidate) => candidate.kind === 'video');
    const clip = track?.clips[0];
    if (!track || !clip) throw new Error('Expected a video clip.');
    useSessionStore.getState().select({ type: 'clip', id: clip.id });
    useEditorStore.getState().setInspectorTab('audio');
    useProjectStore.getState().updateTrackState(track.id, { isLocked: true });

    render(createElement(RightInspector));

    expect(screen.getByRole('status')).toHaveTextContent('This track is locked');
    expect(screen.getByRole('slider', { name: 'Volume slider' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Mute this clip' })).toBeDisabled();
  });
});
