import { ms, ok } from '@videodip/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorHostProvider, type EditorHost } from '../host/editor-host';
import { ProjectArchiveControllerProvider } from './project-archive-controller';
import { TopToolbar } from './top-toolbar';

function createHost(): EditorHost {
  return {
    importMedia: vi.fn(async () => ok([])),
    exportTimeline: vi.fn(async () => ok(null)),
    renderTimelineComposited: vi.fn(async () => ok(null)),
    getRenderEngineStatus: vi.fn(async () => ({
      isAvailable: false,
      nodePath: null,
      cliPath: null,
      reason: 'Unavailable in tests.',
    })),
    toggleFullscreen: vi.fn(async () => ok(true)),
    projects: {
      list: vi.fn(async () => ok([])),
      load: vi.fn(),
      save: vi.fn(async () => ok(undefined)),
      delete: vi.fn(async () => ok(undefined)),
    },
    projectArchives: {
      exportArchive: vi.fn(async () => ok(null)),
      importArchive: vi.fn(async () => ok(null)),
    },
    transcription: {
      id: 'fake',
      name: 'Fake transcription',
      capabilities: vi.fn(async () =>
        ok({
          wordTimestamps: true,
          diarization: false,
          offline: true,
          gpuAccelerated: false,
          languages: 'auto' as const,
        }),
      ),
      availability: vi.fn(async () => ok({ state: 'ready' as const })),
      transcribe: vi.fn(async () => ok({ language: 'en', durationMs: ms(0), segments: [] })),
    },
    transcriptionModels: {
      status: vi.fn(async () => ok({ runtimeAvailable: true, models: [] })),
      download: vi.fn(async () => ok(undefined)),
      delete: vi.fn(async () => ok(undefined)),
      select: vi.fn(),
      selected: vi.fn(() => 'small-q5_1'),
    },
    getMediaArtifact: vi.fn(),
    resolveMediaSource: (locator) => `resolved:${locator}`,
    appUpdates: {
      check: vi.fn(async () => ok(null)),
      downloadAndInstall: vi.fn(async () => ok(undefined)),
      restart: vi.fn(async () => ok(undefined)),
    },
  };
}

function renderToolbar() {
  return render(
    createElement(EditorHostProvider, {
      host: createHost(),
      children: createElement(ProjectArchiveControllerProvider, {
        children: createElement(TopToolbar),
      }),
    }),
  );
}

function menuByLabel(container: HTMLElement, label: string): HTMLDetailsElement {
  const menus = [...container.querySelectorAll('details')];
  const match = menus.find((details) => details.querySelector('summary')?.textContent === label);
  if (!match) throw new Error(`Menu ${label} not found.`);
  return match;
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('toolbar menus', () => {
  it('closes the open menu when another menu opens', () => {
    const { container } = renderToolbar();
    const project = menuByLabel(container, 'Project');
    const edit = menuByLabel(container, 'Edit');

    project.open = true;
    fireEvent(project, new Event('toggle', { bubbles: false }));
    expect(project.open).toBe(true);

    edit.open = true;
    fireEvent(edit, new Event('toggle', { bubbles: false }));

    expect(edit.open).toBe(true);
    expect(project.open).toBe(false);
  });

  it('closes a menu when focus leaves it', () => {
    const { container } = renderToolbar();
    const project = menuByLabel(container, 'Project');
    project.open = true;

    fireEvent.blur(project, { relatedTarget: screen.getByRole('button', { name: 'Undo' }) });
    expect(project.open).toBe(false);
  });

  it('closes a menu on Escape', () => {
    const { container } = renderToolbar();
    const project = menuByLabel(container, 'Project');
    project.open = true;

    fireEvent.keyDown(project, { key: 'Escape' });
    expect(project.open).toBe(false);
  });
});
