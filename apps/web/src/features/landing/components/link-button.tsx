'use client';

import { buttonVariants, cn } from '@videodip/ui';
import type { AnchorHTMLAttributes } from 'react';

/** The variant/size options accepted by the design system's button recipe. */
type ButtonVariantOptions = NonNullable<Parameters<typeof buttonVariants>[0]>;

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Visual style, from the design system's button recipe. */
  readonly variant?: ButtonVariantOptions['variant'];
  /** Size, from the design system's button recipe. */
  readonly size?: ButtonVariantOptions['size'];
}

/**
 * An anchor styled as a design-system button.
 *
 * Navigation must be an `<a>`, not a `<button>` with a handler — middle-click,
 * copy-link and assistive tech all depend on it. This is the page's only
 * client component: `buttonVariants` lives in a `'use client'` module in
 * `@videodip/ui`, so the recipe has to be invoked from a client boundary.
 * Everything else on the landing page stays server-rendered.
 */
export function LinkButton({ variant, size, className, children, ...props }: LinkButtonProps) {
  return (
    <a className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </a>
  );
}
