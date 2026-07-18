/**
 * Headless render entry point (ADR-0011).
 *
 * Runs under the provisioned Node sidecar, never inside the Tauri webview:
 * `node render-cli.js <job.json>` reads a Zod-validated {@link RenderJob},
 * renders the same `VideoDip` composition the live preview shows, and writes
 * the encoded MP4 itself via `@remotion/renderer`.
 *
 * Protocol with the Rust host (`render.rs`):
 * - stdout: `progress=<0..1>` lines, one per update.
 * - stderr: human-readable failure text; the host shows its tail verbatim.
 * - exit 0 on success, 1 on any failure.
 *
 * `node render-cli.js ensure-browser` provisions Chrome Headless Shell ahead
 * of time — the only mode allowed to touch the network. A render run never
 * downloads anything (ADR-0011: no network at export time).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bundle, type WebpackOverrideFn } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { startMediaServer } from './render/media-server.js';
import {
  formatProgressLine,
  overallProgress,
  parseRenderJob,
  type RenderJob,
} from './render/render-job.js';

/** Composition id registered in `Root.tsx`; the one composition VideoDip has. */
const COMPOSITION_ID = 'VideoDip';

function emitProgress(stage: 'bundle' | 'render', fraction: number): void {
  process.stdout.write(`${formatProgressLine(overallProgress(stage, fraction))}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * Supplies `tsconfigRaw` to every esbuild-loader rule so the loader never
 * `require`s the `typescript` package to read tsconfig.json itself — the
 * workspace pins the TypeScript 7 native preview, whose JS shim lacks the
 * `typescript.sys` API that read path needs. Remotion's own internal entry
 * is .tsx, so this applies to every bundle, not only user code.
 */
const provideTsconfigToEsbuild: WebpackOverrideFn = (config) => {
  for (const rule of config.module?.rules ?? []) {
    if (typeof rule !== 'object' || rule === null || !('use' in rule)) continue;
    const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
    for (const use of uses) {
      if (typeof use !== 'object' || use === null || !('loader' in use)) continue;
      if (typeof use.loader !== 'string' || !use.loader.includes('esbuild-loader')) continue;
      use.options = {
        ...(typeof use.options === 'object' && use.options !== null ? use.options : {}),
        tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
      };
    }
  }
  return config;
};

async function resolveServeUrl(bundleDir: string | undefined): Promise<string> {
  if (bundleDir !== undefined) {
    emitProgress('bundle', 1);
    return bundleDir;
  }
  // Bundle from the compiled entry next to this CLI, not from .tsx source:
  // the workspace's TypeScript 7 native preview lacks the JS API Remotion's
  // esbuild-loader would need to read tsconfig for TypeScript inputs.
  const entryPoint = fileURLToPath(new URL('./remotion-entry.js', import.meta.url));
  return bundle({
    entryPoint,
    webpackOverride: provideTsconfigToEsbuild,
    onProgress: (percent) => emitProgress('bundle', percent / 100),
  });
}

async function renderJobFile(jobPath: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(jobPath, 'utf8');
  } catch (error) {
    fail(`Could not read the render job file at ${jobPath}: ${String(error)}`);
  }
  const parsed = parseRenderJob(text);
  if (!parsed.ok) fail(parsed.error);
  const job = parsed.job;

  // Remotion's asset pipeline only loads http(s) URLs, so the job's plain
  // absolute media paths are served over loopback for the duration of the
  // render and the clip sources rewritten to match.
  const mediaServer = await startMediaServer();
  try {
    const props: RenderJob['props'] = {
      ...job.props,
      clips: job.props.clips.map((clip) => ({ ...clip, src: mediaServer.register(clip.src) })),
    };

    const serveUrl = await resolveServeUrl(job.bundleDir);
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps: props,
      ...(job.browserExecutable !== undefined ? { browserExecutable: job.browserExecutable } : {}),
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: job.outputPath,
      inputProps: props,
      onProgress: ({ progress }) => emitProgress('render', progress),
      ...(job.browserExecutable !== undefined ? { browserExecutable: job.browserExecutable } : {}),
      ...(job.concurrency !== undefined ? { concurrency: job.concurrency } : {}),
      ...(job.timeoutInMilliseconds !== undefined
        ? { timeoutInMilliseconds: job.timeoutInMilliseconds }
        : {}),
    });
    emitProgress('render', 1);
  } finally {
    await mediaServer.close();
  }
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (argument === undefined || argument.length === 0) {
    fail('Usage: render-cli <job.json> | render-cli ensure-browser');
  }
  if (argument === 'ensure-browser') {
    await ensureBrowser();
    process.stdout.write('browser=ready\n');
    return;
  }
  await renderJobFile(argument);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
