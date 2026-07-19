'use client';

import { resolveSubtitleStyle } from '@videodip/subtitle-engine';
import { ms } from '@videodip/shared';
import {
  getSelectedClipId,
  getSelectedSubtitleSegmentId,
  getSelectedTransitionId,
  getSessionSelectedClipIds,
  getSessionSelectedSubtitleSegmentIds,
} from '@videodip/timeline';
import { useMemo } from 'react';
import { CommandPalette, useShortcuts, type Shortcut } from '../../shortcuts/index';
import { useEditorStore } from '../editor.store';
import { workspaceGridTemplate, workspaceTimelineRows } from '../lib/workspace-layout';
import { nudgeSubtitlePosition } from '../lib/subtitle-preview-position';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';
import { LeftSidebar } from './left-sidebar';
import { PreviewCanvas } from './preview-canvas';
import {
  ProjectArchiveControllerProvider,
  useProjectArchiveController,
} from './project-archive-controller';
import { ProjectPersistenceController } from './project-persistence-controller';
import { RightInspector } from './right-inspector';
import { StageSplitter } from './stage-splitter';
import { TimelinePanel } from './timeline-panel';
import { TimelinePaneSplitter } from './timeline-pane-splitter';
import { TopToolbar } from './top-toolbar';
import { UpdateBanner } from './update-banner';
import { WorkspacePaneSplitter } from './workspace-pane-splitter';

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
  const zoomIn = useSessionStore((s) => s.zoomIn);
  const zoomOut = useSessionStore((s) => s.zoomOut);
  const toggleSnap = useSessionStore((s) => s.toggleSnapping);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const toggleInspector = useEditorStore((s) => s.toggleInspector);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const activePanel = useEditorStore((s) => s.activePanel);
  const isSidebarCollapsed = useEditorStore((s) => s.sidebarCollapsed);
  const workspaceLayout = useEditorStore((s) => s.workspaceLayout);
  const libraryPaneWidth = useEditorStore((s) => s.libraryPaneWidth);
  const inspectorPaneWidth = useEditorStore((s) => s.inspectorPaneWidth);
  const stagePaneWidth = useEditorStore((s) => s.stagePaneWidth);
  const timelinePaneHeight = useEditorStore((s) => s.timelinePaneHeight);
  const isInspectorCollapsed = useEditorStore((s) => s.inspectorCollapsed);
  const selectedClipId = useSessionStore((s) => getSelectedClipId(s.session));
  const selectedTransitionId = useSessionStore((s) => getSelectedTransitionId(s.session));
  const clearSelection = useSessionStore((s) => s.clearSelection);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const removeClip = useProjectStore((s) => s.removeClip);
  const removeClips = useProjectStore((s) => s.removeClips);
  const removeTransition = useProjectStore((s) => s.removeTransition);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const selectedSubtitleId = useSessionStore((s) => getSelectedSubtitleSegmentId(s.session));
  const removeSubtitle = useSubtitleStore((state) => state.remove);
  const removeSubtitles = useSubtitleStore((state) => state.removeMany);
  const subtitleCanUndo = useSubtitleStore((state) => state.past.length > 0);
  const subtitleCanRedo = useSubtitleStore((state) => state.future.length > 0);

  const nudgeSelectedSubtitle = (deltaX: number, deltaY: number) => {
    const subtitleState = useSubtitleStore.getState();
    const selected = subtitleState.document.segments.find(
      (segment) => segment.id === getSelectedSubtitleSegmentId(useSessionStore.getState().session),
    );
    if (!selected) return;
    const style = resolveSubtitleStyle(subtitleState.document.defaultStyle, selected.style);
    const next = nudgeSubtitlePosition(style, deltaX, deltaY);
    subtitleState.update(selected.id, { style: next });
  };

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
        label: 'Delete selected timeline items',
        scope: 'timeline',
        combo: { key: 'delete' },
        disabled:
          selectedClipId === null && selectedTransitionId === null && selectedSubtitleId === null,
        run: () => {
          const selectedClipIds = getSessionSelectedClipIds(useSessionStore.getState().session);
          if (selectedClipIds.length > 1) {
            removeClips(selectedClipIds);
            clearSelection();
          } else if (selectedClipId) {
            removeClip(selectedClipId);
            clearSelection();
          } else if (selectedTransitionId) {
            removeTransition(selectedTransitionId);
            clearSelection();
          } else if (selectedSubtitleId) {
            const selectedSubtitleIds = getSessionSelectedSubtitleSegmentIds(
              useSessionStore.getState().session,
            );
            if (selectedSubtitleIds.length > 1) removeSubtitles(selectedSubtitleIds);
            else removeSubtitle(selectedSubtitleId);
            clearSelection();
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
        id: 'subtitle.nudgeLeft',
        label: 'Nudge subtitle left',
        scope: 'subtitle',
        combo: { key: 'arrowleft', alt: true },
        disabled: selectedSubtitleId === null,
        run: () => nudgeSelectedSubtitle(-0.005, 0),
      },
      {
        id: 'subtitle.nudgeRight',
        label: 'Nudge subtitle right',
        scope: 'subtitle',
        combo: { key: 'arrowright', alt: true },
        disabled: selectedSubtitleId === null,
        run: () => nudgeSelectedSubtitle(0.005, 0),
      },
      {
        id: 'subtitle.nudgeUp',
        label: 'Nudge subtitle up',
        scope: 'subtitle',
        combo: { key: 'arrowup', alt: true },
        disabled: selectedSubtitleId === null,
        run: () => nudgeSelectedSubtitle(0, -0.005),
      },
      {
        id: 'subtitle.nudgeDown',
        label: 'Nudge subtitle down',
        scope: 'subtitle',
        combo: { key: 'arrowdown', alt: true },
        disabled: selectedSubtitleId === null,
        run: () => nudgeSelectedSubtitle(0, 0.005),
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
      selectedTransitionId,
      clearSelection,
      undo,
      redo,
      removeClip,
      removeClips,
      removeTransition,
      canUndo,
      canRedo,
      selectedSubtitleId,
      removeSubtitle,
      removeSubtitles,
      subtitleCanUndo,
      subtitleCanRedo,
      projectArchives,
    ],
  );

  useShortcuts(shortcuts, true);

  const workspaceGrid = workspaceGridTemplate(workspaceLayout, {
    libraryPaneWidth,
    inspectorPaneWidth,
    stagePaneWidth,
    isLibraryCollapsed: isSidebarCollapsed,
    isInspectorCollapsed,
  });

  return (
    <div className="vd-app-shell bg-surface-base text-text-primary flex h-screen flex-col overflow-hidden">
      <ProjectPersistenceController />
      <UpdateBanner />
      <CommandPalette />
      <TopToolbar />
      <div
        className="grid min-h-0 flex-1"
        data-workspace-layout={workspaceLayout}
        style={{
          gridTemplateAreas: workspaceGrid.areas,
          gridTemplateColumns: workspaceGrid.columns,
          gridTemplateRows: workspaceTimelineRows(timelinePaneHeight),
        }}
      >
        <div className="relative min-h-0 min-w-0" style={{ gridArea: 'library' }}>
          <LeftSidebar />
          {!isSidebarCollapsed && <WorkspacePaneSplitter pane="library" />}
        </div>
        <div
          className={
            // The short-video stage sits flush against the inspector, whose
            // border-l faces the library — so the separator (and its drag
            // handle) lives here.
            workspaceLayout === 'short-video'
              ? 'border-border-subtle relative min-h-0 min-w-0 border-l'
              : 'min-h-0 min-w-0'
          }
          style={{ gridArea: 'preview' }}
        >
          {workspaceLayout === 'short-video' && <StageSplitter />}
          <PreviewCanvas />
        </div>
        <div className="relative min-h-0 min-w-0" style={{ gridArea: 'inspector' }}>
          <RightInspector fillAvailableWidth />
          {workspaceLayout === 'video' && !isInspectorCollapsed && (
            <WorkspacePaneSplitter pane="inspector" />
          )}
        </div>
        <div className="relative min-h-0 min-w-0" style={{ gridArea: 'timeline' }}>
          <TimelinePaneSplitter />
          <TimelinePanel />
        </div>
      </div>
    </div>
  );
}
