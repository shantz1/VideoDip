'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Button styles.
 *
 * Every color here is a semantic token (`bg-accent`, `text-text-primary`).
 * No literal values, no primitive scale references — see the header of
 * `tokens.css` for why that rule is absolute.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'rounded-md border border-transparent',
    'transition-[background-color,border-color,color,box-shadow,opacity]',
    'duration-[--duration-fast] ease-[--ease-out-quad]',
    // Focus ring is on every variant, unconditionally. Removing it is the
    // single most common accessibility regression in a design system.
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-[--color-border-focus]',
    // `disabled:` alone does not cover the loading state, which uses
    // aria-disabled rather than the disabled attribute (see below).
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: ['bg-accent text-text-on-brand', 'hover:bg-accent-hover active:bg-accent-active'],
        secondary: [
          'bg-surface-inset text-text-primary border-border-default',
          'hover:bg-surface-overlay hover:border-border-strong',
        ],
        ghost: ['bg-transparent text-text-secondary', 'hover:bg-surface-hover hover:text-text-primary'],
        outline: [
          'bg-transparent text-text-primary border-border-default',
          'hover:bg-surface-hover hover:border-border-strong',
        ],
        danger: ['bg-danger text-text-on-brand', 'hover:opacity-90 active:opacity-80'],
        link: ['bg-transparent text-accent underline-offset-4', 'hover:underline'],
      },
      size: {
        xs: 'h-6 px-2 text-2xs rounded-xs',
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-10 px-4 text-base rounded-lg',
        // Square targets for toolbar icons; padding would make them oblong.
        icon: 'size-8 p-0',
        'icon-sm': 'size-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>,
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a spinner and blocks interaction.
   *
   * `CLAUDE.md` requires a loading state on every async action. Prefer this
   * over disabling the button yourself: it keeps the button focusable and
   * announces the state, which manual disabling does not.
   */
  readonly loading?: boolean;
  /** Blocks interaction. Distinct from `loading` — see {@link loading}. */
  readonly disabled?: boolean;
  /** Rendered before the label. Decorative; hidden from assistive tech. */
  readonly leadingIcon?: ReactNode;
  /** Rendered after the label. Decorative; hidden from assistive tech. */
  readonly trailingIcon?: ReactNode;
  /**
   * Accessible name. **Required** when the button renders only an icon —
   * otherwise it is announced as "button" with no indication of what it does.
   */
  readonly 'aria-label'?: string;
}

/**
 * The primary action primitive.
 *
 * Accessibility notes worth understanding before copying this pattern:
 *
 * - While `loading`, the button uses `aria-disabled` rather than the `disabled`
 *   attribute. A truly disabled element is removed from the tab order, so a
 *   keyboard user's focus is silently dropped mid-interaction the moment they
 *   activate it. `aria-disabled` keeps focus and announces unavailability;
 *   the click handler is suppressed in JS instead.
 * - The spinner replaces the leading icon rather than being appended, so the
 *   button does not resize mid-action and shift the layout around it.
 *
 * @example
 * ```tsx
 * <Button variant="primary" loading={isExporting} onClick={onExport}>
 *   Export
 * </Button>
 *
 * <Button size="icon" aria-label="Split clip" leadingIcon={<Scissors />} />
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    loading = false,
    disabled = false,
    leadingIcon,
    trailingIcon,
    children,
    onClick,
    type = 'button',
    ...props
  },
  ref,
) {
  const unavailable = loading || disabled;

  return (
    <button
      ref={ref}
      // Only `disabled` sets the real attribute; `loading` must stay focusable.
      disabled={disabled}
      aria-disabled={unavailable || undefined}
      aria-busy={loading || undefined}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={(event) => {
        // aria-disabled has no browser behaviour, so the guard is ours.
        if (unavailable) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon ? <Slot>{leadingIcon}</Slot> : null}
      {children}
      {trailingIcon && !loading ? <Slot>{trailingIcon}</Slot> : null}
    </button>
  );
});

/**
 * Wraps a decorative icon.
 *
 * `aria-hidden` because the button's text (or `aria-label`) is already the
 * accessible name — announcing the icon as well produces "Export Export".
 */
function Slot({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-[1.15em]">
      {children}
    </span>
  );
}

/**
 * Loading spinner.
 *
 * CSS `animate-spin`, not Framer: `index.css` neutralises CSS animations under
 * `prefers-reduced-motion`, so this degrades for free. A JS-driven spinner
 * would need explicit handling.
 */
function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-[1.15em] shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { buttonVariants };
