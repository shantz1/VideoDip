import { readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isDryRun = process.argv.includes('--dry-run');
const includesDependencies = process.argv.includes('--dependencies');

const generatedDirectoryNames = new Set([
  '.cache',
  '.debug',
  '.next',
  '.parcel-cache',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'out',
  'storybook-static',
]);
const ignoredDirectoryNames = new Set(['.agents', '.claude', '.codex', '.git']);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isCargoTarget(path) {
  return await exists(join(dirname(path), 'Cargo.toml'));
}

async function collectGeneratedPaths(directory, targets) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isFile()) {
      if (entry.name.endsWith('.tsbuildinfo')) targets.add(path);
      continue;
    }
    if (!entry.isDirectory() || ignoredDirectoryNames.has(entry.name)) continue;
    if (entry.name === 'node_modules') {
      if (includesDependencies) targets.add(path);
      continue;
    }
    if (
      generatedDirectoryNames.has(entry.name) ||
      (entry.name === 'target' && (await isCargoTarget(path)))
    ) {
      targets.add(path);
      continue;
    }
    await collectGeneratedPaths(path, targets);
  }
}

async function pathSize(path) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    return 0;
  }
  if (metadata.isFile()) return metadata.size;
  if (!metadata.isDirectory()) return 0;

  let bytes = 0;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) bytes += await pathSize(join(path, entry.name));
  }
  return bytes;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

const targets = new Set();
await collectGeneratedPaths(repositoryRoot, targets);
const sortedTargets = [...targets].sort((left, right) => left.localeCompare(right));

if (sortedTargets.length === 0) {
  console.log('VideoDip generated output is already clean.');
  process.exit(0);
}

let totalBytes = 0;
const measuredTargets = [];
for (const path of sortedTargets) {
  const bytes = await pathSize(path);
  totalBytes += bytes;
  measuredTargets.push({ path, bytes });
}

console.log(
  `${isDryRun ? 'Would remove' : 'Removing'} ${measuredTargets.length} generated path(s) (${formatBytes(totalBytes)}):`,
);
for (const target of measuredTargets) {
  console.log(`- ${relative(repositoryRoot, target.path)} (${formatBytes(target.bytes)})`);
}

if (isDryRun) {
  console.log('Dry run only; no files were changed.');
  process.exit(0);
}

const failures = [];
for (const target of measuredTargets) {
  try {
    await rm(target.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  } catch (error) {
    failures.push({ path: target.path, error });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Could not remove ${relative(repositoryRoot, failure.path)}:`, failure.error);
  }
  console.error('Close any running VideoDip/Next/Cargo processes, then run the command again.');
  process.exitCode = 1;
} else {
  console.log(`Reclaimed approximately ${formatBytes(totalBytes)}.`);
}
