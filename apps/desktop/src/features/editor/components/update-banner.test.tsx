import { ms, ok, type AppUpdatePort } from '@videodip/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EditorHostProvider, type EditorHost } from '../host/editor-host';
import { UpdateBanner } from './update-banner';

function createHost(appUpdates: AppUpdatePort): EditorHost {
  return {
    importMedia: vi.fn(async () => ok([])),
    exportTimeline: vi.fn(async () => ok(null)),
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
    appUpdates,
  };
}

const renderBanner = (appUpdates: AppUpdatePort) =>
  render(
    createElement(EditorHostProvider, {
      host: createHost(appUpdates),
      children: createElement(UpdateBanner, { checkDelayMs: 0 }),
    }),
  );

describe('UpdateBanner', () => {
  it('renders nothing when the feed reports up to date or is unreachable', async () => {
    const check = vi.fn(async () => ok(null));
    renderBanner({
      check,
      downloadAndInstall: vi.fn(async () => ok(undefined)),
      restart: vi.fn(async () => ok(undefined)),
    });

    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('auto-downloads a found update, then waits for the user before restarting', async () => {
    const user = userEvent.setup();
    const restart = vi.fn(async () => ok(undefined));
    renderBanner({
      check: vi.fn(async () => ok({ version: '0.2.0' })),
      downloadAndInstall: vi.fn(async () => ok(undefined)),
      restart,
    });

    await screen.findByText(/0\.2\.0 is downloaded and applies on restart/);
    expect(restart).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Restart now/ }));
    expect(restart).toHaveBeenCalledOnce();
  });

  it('lets the user defer the restart and stays out of the way', async () => {
    const user = userEvent.setup();
    renderBanner({
      check: vi.fn(async () => ok({ version: '0.2.0' })),
      downloadAndInstall: vi.fn(async () => ok(undefined)),
      restart: vi.fn(async () => ok(undefined)),
    });

    await screen.findByText(/applies on restart/);
    await user.click(screen.getByRole('button', { name: /later/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
