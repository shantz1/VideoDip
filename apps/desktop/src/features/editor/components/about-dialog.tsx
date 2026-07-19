'use client';

import { Button, cn } from '@videodip/ui';
import { Scale, UserRound, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

const GITHUB_PROFILE_URL = 'https://github.com/shantz1';
const LICENSE_URL = 'https://github.com/shantz1/VideoDip/blob/main/LICENSE';

export interface AboutDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/** Product, developer, source, and legal notices shown from the Help menu. */
export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;

    const activeElement = document.activeElement;
    if (
      event.shiftKey &&
      (activeElement === first || !dialogRef.current?.contains(activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="bg-surface-overlay/70 fixed inset-0 z-(--z-modal) flex items-center justify-center p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-videodip-title"
        aria-describedby="about-videodip-description"
        onKeyDown={keepFocusInside}
        className={cn(
          'border-border-default bg-surface-raised w-full max-w-md overflow-hidden rounded-xl border shadow-xl',
          'text-text-primary',
        )}
      >
        <div className="border-border-subtle flex items-start gap-4 border-b p-5">
          <div
            className="bg-accent text-text-on-brand grid size-11 shrink-0 place-items-center rounded-lg"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id="about-videodip-title" className="text-base font-semibold tracking-tight">
                VideoDip
              </h2>
              <span className="border-border-subtle bg-surface-inset text-text-tertiary rounded-full border px-2 py-0.5 text-xs">
                0.1.0
              </span>
            </div>
            <p id="about-videodip-description" className="text-text-secondary mt-1 text-sm">
              Open-source, offline-first video editing for short-form creators.
            </p>
          </div>
          <Button
            ref={closeButtonRef}
            size="icon-sm"
            variant="ghost"
            aria-label="Close About VideoDip"
            leadingIcon={<X />}
            onClick={onClose}
          />
        </div>

        <div className="space-y-4 p-5">
          <section aria-labelledby="about-developer-heading">
            <div className="text-text-tertiary mb-2 flex items-center gap-2">
              <UserRound className="size-4" aria-hidden="true" />
              <h3
                id="about-developer-heading"
                className="text-xs font-medium tracking-wide uppercase"
              >
                Developer
              </h3>
            </div>
            <div className="border-border-subtle bg-surface-inset flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span className="text-sm font-medium">Shantanu Udasi</span>
              <a
                href={GITHUB_PROFILE_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'text-accent hover:text-accent-hover text-sm',
                  'rounded-sm focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
                )}
              >
                @shantz1
              </a>
            </div>
          </section>

          <section aria-labelledby="about-license-heading">
            <div className="text-text-tertiary mb-2 flex items-center gap-2">
              <Scale className="size-4" aria-hidden="true" />
              <h3
                id="about-license-heading"
                className="text-xs font-medium tracking-wide uppercase"
              >
                License
              </h3>
            </div>
            <div className="border-border-subtle bg-surface-inset rounded-lg border p-3">
              <p className="text-sm font-medium">GNU Affero General Public License v3.0 only</p>
              <p className="text-text-secondary mt-1.5 text-xs leading-relaxed">
                VideoDip is free software. You may redistribute and modify it under the
                AGPL-3.0-only terms. It is provided without warranty.
              </p>
              <a
                href={LICENSE_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'text-accent hover:text-accent-hover mt-2 inline-flex rounded-sm text-xs font-medium',
                  'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
                )}
              >
                Read the complete license
              </a>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
