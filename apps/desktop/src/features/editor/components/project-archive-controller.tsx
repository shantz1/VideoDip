'use client';

import { Button, cn } from '@videodip/ui';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useEditorHost } from '../host/editor-host';
import {
  exportCurrentProjectArchive,
  importProjectArchive as importProjectArchiveCommand,
} from '../lib/project-commands';

export type ProjectArchivePhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'importing'; readonly message: string }
  | {
      readonly kind: 'exporting';
      readonly mode: 'portable' | 'linked';
      readonly message: string;
    }
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export interface ProjectArchiveControllerValue {
  readonly phase: ProjectArchivePhase;
  readonly isBusy: boolean;
  readonly exportPortable: () => Promise<void>;
  readonly exportLinked: () => Promise<void>;
  readonly importArchive: () => Promise<void>;
}

const ProjectArchiveContext = createContext<ProjectArchiveControllerValue | null>(null);

/** Coordinates archive dialogs, store replacement, progress, and recovery UI. */
export function ProjectArchiveControllerProvider({ children }: { readonly children: ReactNode }) {
  const { projects, projectArchives } = useEditorHost();
  const [phase, setPhase] = useState<ProjectArchivePhase>({ kind: 'idle' });
  const isBusy = phase.kind === 'importing' || phase.kind === 'exporting';

  const runExport = useCallback(
    async (includeMedia: boolean) => {
      if (isBusy) return;
      setPhase({
        kind: 'exporting',
        mode: includeMedia ? 'portable' : 'linked',
        message: includeMedia
          ? 'Packaging the project and source media…'
          : 'Packaging the project with linked media…',
      });
      const result = await exportCurrentProjectArchive(projects, projectArchives, includeMedia);
      if (!result.ok) {
        setPhase({ kind: 'error', message: result.error.recovery });
      } else if (result.value === null) {
        setPhase({ kind: 'idle' });
      } else {
        setPhase({
          kind: 'success',
          message: `${result.value.outputName} exported successfully.`,
        });
      }
    },
    [isBusy, projectArchives, projects],
  );

  const exportPortable = useCallback(() => runExport(true), [runExport]);
  const exportLinked = useCallback(() => runExport(false), [runExport]);

  const importArchive = useCallback(async () => {
    if (isBusy) return;
    setPhase({ kind: 'importing', message: 'Validating and importing the project archive…' });
    const result = await importProjectArchiveCommand(projects, projectArchives);
    if (!result.ok) {
      setPhase({ kind: 'error', message: result.error.recovery });
    } else if (result.value === null) {
      setPhase({ kind: 'idle' });
    } else {
      setPhase({
        kind: 'success',
        message: `${result.value.name} imported and saved locally.`,
      });
    }
  }, [isBusy, projectArchives, projects]);

  const value = useMemo<ProjectArchiveControllerValue>(
    () => ({ phase, isBusy, exportPortable, exportLinked, importArchive }),
    [exportLinked, exportPortable, importArchive, isBusy, phase],
  );

  return (
    <ProjectArchiveContext.Provider value={value}>
      {children}
      {phase.kind !== 'idle' && (
        <div
          role={phase.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'fixed right-4 bottom-4 z-50 flex max-w-md items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-xl',
            phase.kind === 'error' && 'bg-danger-subtle text-danger',
            phase.kind === 'success' && 'bg-success-subtle text-success',
            (phase.kind === 'importing' || phase.kind === 'exporting') &&
              'bg-surface-raised text-text-primary border-border-default border',
          )}
        >
          <span>{phase.message}</span>
          {!isBusy && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Dismiss archive status"
              leadingIcon={<X />}
              onClick={() => setPhase({ kind: 'idle' })}
            />
          )}
        </div>
      )}
    </ProjectArchiveContext.Provider>
  );
}

/** Accesses the single archive command controller mounted at the editor root. */
export function useProjectArchiveController(): ProjectArchiveControllerValue {
  const controller = useContext(ProjectArchiveContext);
  if (controller === null) {
    throw new Error('ProjectArchiveControllerProvider is missing above the editor UI.');
  }
  return controller;
}
