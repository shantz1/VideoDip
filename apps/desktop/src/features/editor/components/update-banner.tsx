'use client';

import { Button } from '@videodip/ui';
import { DownloadCloud, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEditorHost } from '../host/editor-host';

type UpdatePhase =
  | { readonly phase: 'idle' }
  | { readonly phase: 'downloading'; readonly version: string; readonly fraction: number }
  | { readonly phase: 'ready'; readonly version: string }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'dismissed' };

/**
 * Silent self-update flow: checks the signed feed once after startup, downloads
 * a found update automatically, then asks before restarting.
 *
 * Auto-download is a product requirement — the app must apply updates itself,
 * not merely announce them — but the restart stays the user's call because it
 * interrupts editing. An unreachable feed produces no UI at all (offline-first).
 *
 * @param checkDelayMs Startup grace period so the check never competes with
 * cold-start work; tests pass 0.
 */
export function UpdateBanner({ checkDelayMs = 5000 }: { readonly checkDelayMs?: number }) {
  const { appUpdates } = useEditorHost();
  const [state, setState] = useState<UpdatePhase>({ phase: 'idle' });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    let disposed = false;
    const run = async () => {
      const found = await appUpdates.check();
      if (disposed || !found.ok || found.value === null) return;
      const version = found.value.version;
      setState({ phase: 'downloading', version, fraction: 0 });
      const staged = await appUpdates.downloadAndInstall((fraction) => {
        if (!disposed) {
          setState((current) =>
            current.phase === 'downloading' ? { ...current, fraction } : current,
          );
        }
      });
      if (disposed) return;
      setState(
        staged.ok
          ? { phase: 'ready', version }
          : { phase: 'error', message: staged.error.recovery },
      );
    };
    const timer = window.setTimeout(() => void run(), checkDelayMs);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [appUpdates, checkDelayMs]);

  if (state.phase === 'idle' || state.phase === 'dismissed') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-border-default bg-surface-overlay fixed right-4 bottom-4 z-(--z-toast) flex max-w-sm items-center gap-3 rounded-md border p-3 shadow-lg"
    >
      {state.phase === 'downloading' && (
        <>
          <DownloadCloud className="text-text-secondary size-4 shrink-0" aria-hidden />
          <p className="text-text-secondary text-xs">
            Downloading VideoDip {state.version} · {Math.round(state.fraction * 100)}%
          </p>
        </>
      )}
      {state.phase === 'ready' && (
        <>
          <p className="text-text-primary text-xs">
            VideoDip {state.version} is downloaded and applies on restart.
          </p>
          <Button size="sm" onClick={() => void appUpdates.restart()}>
            <RefreshCw className="size-3.5" aria-hidden />
            Restart now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Apply the update later"
            onClick={() => setState({ phase: 'dismissed' })}
          >
            Later
          </Button>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <p className="text-text-secondary text-xs">{state.message}</p>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Dismiss update notice"
            onClick={() => setState({ phase: 'dismissed' })}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}
