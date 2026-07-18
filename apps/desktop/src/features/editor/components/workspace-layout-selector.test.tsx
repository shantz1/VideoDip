import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { shortcutRegistry } from '../../shortcuts/use-shortcuts';
import { useEditorStore } from '../editor.store';
import { WorkspaceLayoutSelector } from './workspace-layout-selector';

describe('WorkspaceLayoutSelector', () => {
  beforeEach(() => {
    shortcutRegistry.clear();
    useEditorStore.setState({
      workspaceLayout: 'short-video',
      aspectRatio: '9:16',
      isDirty: false,
      editRevision: 0,
    });
  });

  it('switches the complete editor without changing the project ratio', async () => {
    const user = userEvent.setup();
    render(createElement(WorkspaceLayoutSelector));

    await user.click(screen.getByLabelText('Workspace layout: Short video'));
    await user.click(screen.getByRole('menuitemradio', { name: /Video editing/i }));

    expect(useEditorStore.getState()).toMatchObject({
      workspaceLayout: 'video',
      aspectRatio: '9:16',
      isDirty: false,
      editRevision: 0,
    });
    expect(screen.getByLabelText('Workspace layout: Video editing')).toBeInTheDocument();
  });

  it('registers the discoverable workspace toggle shortcut', async () => {
    render(createElement(WorkspaceLayoutSelector));

    await waitFor(() =>
      expect(shortcutRegistry.list().some((item) => item.id === 'view.toggleWorkspaceLayout')).toBe(
        true,
      ),
    );
    act(() => {
      shortcutRegistry.dispatch(
        new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, shiftKey: true }),
        false,
      );
    });

    expect(useEditorStore.getState()).toMatchObject({
      workspaceLayout: 'video',
      aspectRatio: '9:16',
      isDirty: false,
    });
  });
});
