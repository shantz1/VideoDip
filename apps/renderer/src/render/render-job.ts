import { z } from 'zod';
import { videoDipCompositionSchema } from '../composition.js';

/**
 * The render job a headless export run consumes, written to disk by the
 * desktop shell and read back by `render-cli` under the Node sidecar
 * (ADR-0011).
 *
 * It crosses a process and disk boundary, so it is Zod-validated on the way
 * in — a malformed job must fail loudly before Chromium ever launches. The
 * props are the very same schema the live `<Player>` preview validates, which
 * is the whole point: one composition contract, two consumers, zero drift.
 */
export const renderJobSchema = z.strictObject({
  /** Composition input props — identical contract to the live preview. */
  props: videoDipCompositionSchema,
  /** Absolute path the encoded MP4 is written to. */
  outputPath: z.string().min(1),
  /**
   * Prebundled Remotion serve directory. When present the CLI skips
   * webpack entirely — release installs provision the bundle once; dev
   * machines may omit it and bundle from source on demand.
   */
  bundleDir: z.string().min(1).optional(),
  /**
   * Chrome Headless Shell executable. Provisioned ahead of time; when
   * omitted, Remotion falls back to its locally provisioned browser. The
   * CLI never downloads a browser mid-export (ADR-0011: no network at
   * export time).
   */
  browserExecutable: z.string().min(1).optional(),
  /** Parallel render workers. Remotion picks a sane default when omitted. */
  concurrency: z.number().int().positive().max(64).optional(),
  /** Per-frame delayRender timeout. Remotion's default applies when omitted. */
  timeoutInMilliseconds: z
    .number()
    .int()
    .positive()
    .max(10 * 60 * 1_000)
    .optional(),
});

export type RenderJob = z.infer<typeof renderJobSchema>;

/**
 * Parses raw job-file text into a validated {@link RenderJob}.
 *
 * Returns a plain discriminated union rather than throwing so the CLI's
 * top-level can turn every failure into a single machine-readable stderr
 * line — the Rust host surfaces that line verbatim to the user.
 */
export function parseRenderJob(
  text: string,
): { readonly ok: true; readonly job: RenderJob } | { readonly ok: false; readonly error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `The render job file is not valid JSON: ${String(error)}` };
  }
  const parsed = renderJobSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return {
      ok: false,
      error: `The render job is invalid at ${path}: ${issue?.message ?? 'unknown issue'}`,
    };
  }
  return { ok: true, job: parsed.data };
}

/**
 * Formats a progress fraction as the stdout line the Rust host parses.
 *
 * The protocol is one `progress=<0..1>` line per update — mirroring FFmpeg's
 * `out_time_us=` convention already handled in `export.rs`, so the host-side
 * streaming code stays structurally identical across both engines.
 */
export function formatProgressLine(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return `progress=${clamped.toFixed(4)}`;
}

/**
 * Maps the two sequential phases (webpack bundling, then frame rendering)
 * onto one monotonic 0..1 scale so the exported progress bar never jumps
 * backwards. Bundling is short relative to rendering; it owns the first 10%.
 */
export function overallProgress(stage: 'bundle' | 'render', fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return stage === 'bundle' ? clamped * 0.1 : 0.1 + clamped * 0.9;
}
