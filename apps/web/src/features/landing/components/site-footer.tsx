import { GITHUB_URL, LICENSE_URL } from '../landing.content';

/**
 * Site footer: license note and the repository link. No sitemap, no social
 * grid, no newsletter — there is nothing behind those yet.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border-subtle px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-text-tertiary">
          VideoDip is free software, licensed under{' '}
          <a
            href={LICENSE_URL}
            className="text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            AGPL-3.0
          </a>
          .
        </p>
        <a
          href={GITHUB_URL}
          className="text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
