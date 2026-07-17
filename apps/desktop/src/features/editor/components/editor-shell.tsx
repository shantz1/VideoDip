'use client';

import { ms } from '@videodip/shared';
import { useMemo } from 'react';
import { CommandPalette, useShortcuts, type Shortcut } from '../../shortcuts/index';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';
import { LeftSidebar } from './left-sidebar';
import { PreviewCanvas } from './preview-canvas';
import {
  ProjectArchiveControllerProvider,
  useProjectArchiveController,
} from './project-archive-controller';
import { ProjectPersistenceController } from './project-persistence-controller';
import { RightInspector } from './right-inspector';
import { TimelinePanel } from './timeline-panel';
import { TopToolbar } from './top-toolbar';

/** How far the arrow keys move the playhead. Shift jumps a second. */
const NUDGE_SMALL = ms(100);
const NUDGE_LARGE = ms(1000);

/**
 * The editor layout, and the single place shortcuts are bound to the app.
 *
 * Composes the five regions from the product brief: toolbar, left rail,
 * preview, inspector, timeline.
 *
 * This is also the only component that attaches the global key listener
 * (`attachListener`). Every other component registers shortcuts and lets the
 * registry dispatch — see `CLAUDE.md` on never using ad-hoc listeners.
 */
export function EditorShell() {
  return (
    <ProjectArchiveControllerProvider>
      <EditorShellContent />
    </ProjectArchiveControllerProvider>
  );
}

function EditorShellContent() {
  const projectArchives = useProjectArchiveController();
  const togglePlayback = useEditorStore((s) => s.togglePlayback);
  const nudge = useEditorStore((s) => s.nudge);
  const seek = useEditorStore((s) => s.seek);
  const duration = useEditorStore((s) => s.duration);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const toggleInspector = useEditorStore((s) => s.toggleInspector);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const activePanel = useEditorStore((s) => s.activePanel);
  const isSidebarCollapsed = useEditorStore((s) => s.sidebarCollapsed);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectClip = useEditorStore((s) => s.selectClip);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const removeClip = useProjectStore((s) => s.removeClip);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const selectedSubtitleId = useSubtitleStore((state) => state.selectedSegmentId);
  const removeSubtitle = useSubtitleStore((state) => state.remove);
  const subtitleCanUndo = useSubtitleStore((state) => state.past.length > 0);
  const subtitleCanRedo = useSubtitleStore((state) => state.future.length > 0);

  // Memoised so the identity is stable: useShortcuts re-registers when the
  // list's shape changes, and a fresh array every render would thrash it.
  const shortcuts = useMemo<readonly Shortcut[]>(
    () => [
      {
        id: 'project.importArchive',
        label: 'Import VideoDip project',
        scope: 'global',
        combo: { key: 'o', mod: true, shift: true },
        disabled: projectArchives.isBusy,
        run: () => void projectArchives.importArchive(),
      },
      {
        id: 'project.exportArchive',
        label: 'Export portable VideoDip project',
        scope: 'global',
        combo: { key: 's', mod: true, shift: true },
        disabled: projectArchives.isBusy,
        run: () => void projectArchives.exportPortable(),
      },
      {
        id: 'edit.undo',
        label: 'Undo',
        scope: 'global',
        combo: { key: 'z', mod: true },
        disabled: !canUndo && !subtitleCanUndo,
        run: () => {
          if (selectedSubtitleId && subtitleCanUndo) useSubtitleStore.getState().undo();
          else undo();
        },
      },
      {
        id: 'edit.redo',
        label: 'Redo',
        scope: 'global',
        combo: { key: 'z', mod: true, shift: true },
        disabled: !canRedo && !subtitleCanRedo,
        run: () => {
          if (selectedSubtitleId && subtitleCanRedo) useSubtitleStore.getState().redo();
          else redo();
        },
      },
      {
        id: 'edit.deleteClip',
        label: 'Delete selected clip',
        scope: 'timeline',
        combo: { key: 'delete' },
        disabled: selectedClipId === null && selectedSubtitleId === null,
        run: () => {
          if (selectedClipId) {
            removeClip(selectedClipId);
            selectClip(null);
          } else if (selectedSubtitleId) {
            removeSubtitle(selectedSubtitleId);
          }
        },
      },
      {
        id: 'playback.toggle',
        label: 'Play / Pause',
        scope: 'playback',
        combo: { key: ' ' },
        run: togglePlayback,
      },
      {
        id: 'playback.nudgeBack',
        label: 'Step back',
        scope: 'playback',
        combo: { key: 'arrowleft' },
        run: () => nudge(ms(-NUDGE_SMALL)),
      },
      {
        id: 'playback.nudgeForward',
        label: 'Step forward',
        scope: 'playback',
        combo: { key: 'arrowright' },
        run: () => nudge(NUDGE_SMALL),
      },
      {
        id: 'playback.jumpBack',
        label: 'Jump back 1s',
        scope: 'playback',
        combo: { key: 'arrowleft', shift: true },
        run: () => nudge(ms(-NUDGE_LARGE)),
      },
      {
        id: 'playback.jumpForward',
        label: 'Jump forward 1s',
        scope: 'playback',
        combo: { key: 'arrowright', shift: true },
        run: () => nudge(NUDGE_LARGE),
      },
      {
        id: 'playback.start',
        label: 'Go to start',
        scope: 'playback',
        combo: { key: 'home' },
        run: () => seek(ms(0)),
      },
      {
        id: 'playback.end',
        label: 'Go to end',
        scope: 'playback',
        combo: { key: 'end' },
        run: () => seek(duration),
      },
      {
        id: 'timeline.zoomIn',
        label: 'Zoom in',
        scope: 'timeline',
        combo: { key: '=', mod: true },
        run: zoomIn,
      },
      {
        id: 'timeline.zoomOut',
        label: 'Zoom out',
        scope: 'timeline',
        combo: { key: '-', mod: true },
        run: zoomOut,
      },
      {
        id: 'timeline.toggleSnap',
        label: 'Toggle snapping',
        scope: 'timeline',
        combo: { key: 'n' },
        run: toggleSnap,
      },
      {
        id: 'ai.openSubtitles',
        label: 'Open AI subtitles',
        scope: 'global',
        combo: { key: 'g', mod: true, shift: true },
        run: () => {
          setActivePanel('ai');
          if (activePanel === 'ai' && isSidebarCollapsed) toggleSidebar();
        },
      },
      {
        id: 'view.toggleSidebar',
        label: 'Toggle sidebar',
        scope: 'view',
        combo: { key: 'b', mod: true },
        run: toggleSidebar,
      },
      {
        id: 'view.toggleInspector',
        label: 'Toggle inspector',
        scope: 'view',
        combo: { key: 'i', mod: true },
        run: toggleInspector,
      },
    ],
    [
      togglePlayback,
      nudge,
      seek,
      duration,
      zoomIn,
      zoomOut,
      toggleSnap,
      toggleSidebar,
      toggleInspector,
      setActivePanel,
      activePanel,
      isSidebarCollapsed,
      selectedClipId,
      selectClip,
      undo,
      redo,
      removeClip,
      canUndo,
      canRedo,
      selectedSubtitleId,
      removeSubtitle,
      subtitleCanUndo,
      subtitleCanRedo,
      projectArchives,
    ],
  );

  useShortcuts(shortcuts, true);

  return (
    <div className="vd-app-shell bg-surface-base text-text-primary flex h-screen flex-col overflow-hidden">
      <ProjectPersistenceController />
      <CommandPalette />
      <TopToolbar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <PreviewCanvas />
        <RightInspector />
      </div>
      <TimelinePanel />
    </div>
  );
}
