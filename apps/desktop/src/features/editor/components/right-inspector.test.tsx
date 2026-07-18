import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ms, type AssetId } from '@videodip/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { RightInspector } from './right-inspector';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
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
    useEditorStore.getState().selectTransition(transition.id);
    useEditorStore.getState().setInspectorTab('effects');

    const user = userEvent.setup();
    render(createElement(RightInspector));

    expect(screen.getByText('Clip transition')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'wipe-left');
    expect(useProjectStore.getState().document.transitions[0]?.kind).toBe('wipe-left');

    await user.click(screen.getByRole('button', { name: 'Remove transition' }));
    expect(useProjectStore.getState().document.transitions).toEqual([]);
    expect(useEditorStore.getState().selectedTransitionId).toBeNull();
  });
});
