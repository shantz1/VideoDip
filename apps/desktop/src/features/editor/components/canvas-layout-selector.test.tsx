import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { shortcutRegistry } from '../../shortcuts/use-shortcuts';
import { useEditorStore } from '../editor.store';
import { CanvasLayoutSelector } from './canvas-layout-selector';

describe('CanvasLayoutSelector', () => {
  beforeEach(() => {
    shortcutRegistry.clear();
    useEditorStore.setState({ aspectRatio: '9:16', isDirty: false, editRevision: 0 });
  });

  it('switches one project between reel and horizontal video layouts', async () => {
    const user = userEvent.setup();
    render(createElement(CanvasLayoutSelector));

    await user.click(screen.getByLabelText('Canvas layout: Reel / Short 9:16'));
    await user.click(screen.getByRole('menuitemradio', { name: /Horizontal video/i }));

    expect(useEditorStore.getState()).toMatchObject({
      aspectRatio: '16:9',
      isDirty: true,
      editRevision: 1,
    });
    expect(screen.getByLabelText('Canvas layout: Horizontal video 16:9')).toBeInTheDocument();
  });
});
