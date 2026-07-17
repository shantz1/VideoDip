'use client';

import { useEffect, useState } from 'react';
import type { MediaItem } from '@videodip/media-engine';
import { useEditorStore } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import { loadLatestProject, saveProjectState } from '../lib/project-persistence';
import { useProjectStore } from '../project.store';

const AUTOSAVE_DELAY_MS = 750;

/** Restores the newest project once, then persists validated snapshots after edits. */
export function ProjectPersistenceController() {
  const { projects } = useEditorHost();
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const projectId = useEditorStore((state) => state.projectId);
  const projectName = useEditorStore((state) => state.projectName);
  const projectCreatedAt = useEditorStore((state) => state.projectCreatedAt);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const editRevision = useEditorStore((state) => state.editRevision);
  const isDirty = useEditorStore((state) => state.isDirty);
  const document = useProjectStore((state) => state.document);

  useEffect(() => {
    let active = true;

    void (async () => {
      const loaded = await loadLatestProject(projects);
      if (!active) return;
      if (!loaded.ok) {
        setFailure(`${loaded.error.message} ${loaded.error.recovery}`);
        useEditorStore.getState().newProject();
        setReady(true);
        return;
      }

      if (loaded.value === null) {
        useEditorStore.getState().newProject();
        setReady(true);
        return;
      }

      useEditorStore.getState().restoreProject({
        ...loaded.value,
        // Zod's exact runtime output matches MediaItem. This cast closes the
        // exactOptionalPropertyTypes gap created by inferred optional fields.
        mediaItems: loaded.value.mediaItems as readonly MediaItem[],
      });
      useProjectStore.getState().load(loaded.value.timeline);
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, [projects]);

  useEffect(() => {
    if (
      !ready ||
      !isDirty ||
      projectId === null ||
      projectName === null ||
      projectCreatedAt === null
    ) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void saveProjectState(
        projects,
        {
          id: projectId,
          name: projectName,
          aspectRatio,
          timeline: document,
          mediaItems,
          createdAt: projectCreatedAt,
          updatedAt: new Date().toISOString(),
        },
        controller.signal,
      ).then((saved) => {
        if (controller.signal.aborted) return;
        if (!saved.ok) {
          setFailure(`${saved.error.message} ${saved.error.recovery}`);
          return;
        }
        useEditorStore.getState().markSaved(editRevision);
        setFailure(null);
      });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    aspectRatio,
    document,
    editRevision,
    isDirty,
    mediaItems,
    projectCreatedAt,
    projectId,
    projectName,
    projects,
    ready,
  ]);

  if (failure === null) return null;
  return (
    <p
      role="alert"
      className="border-danger/40 bg-surface-raised text-danger fixed right-4 bottom-4 z-50 max-w-md rounded-lg border px-4 py-3 text-sm shadow-xl"
    >
      {failure}
    </p>
  );
}
