import {
  ok,
  type ProjectRepository,
  type ProjectSnapshot,
  type ProjectSummary,
  type Result,
} from '@videodip/shared';
import { buildProjectSnapshot, type ProjectSnapshotSource } from './project-snapshot';

type ProjectStore = ProjectRepository<ProjectSnapshot, ProjectSummary>;

/** Loads the newest project summary and snapshot without coupling startup to a host. */
export async function loadLatestProject(
  projects: ProjectStore,
  signal?: AbortSignal,
): Promise<Result<ProjectSnapshot | null>> {
  const listed = await projects.list(signal);
  if (!listed.ok) return listed;
  const latest = listed.value[0];
  if (!latest) return ok(null);
  return projects.load(latest.id, signal);
}

/** Validates current state before asking the selected host repository to save it. */
export async function saveProjectState(
  projects: ProjectStore,
  source: ProjectSnapshotSource,
  signal?: AbortSignal,
): Promise<Result<void>> {
  const snapshot = buildProjectSnapshot(source);
  if (!snapshot.ok) return snapshot;
  return projects.save(snapshot.value, signal);
}
