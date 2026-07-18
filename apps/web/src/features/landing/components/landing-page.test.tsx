import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GITHUB_URL } from '../landing.content';
import { LandingPage } from './landing-page';

describe('LandingPage', () => {
  it('renders the hero claim as the page heading', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /your media never leaves your machine/i }),
    ).toBeInTheDocument();
  });

  it('exposes the header, main and footer landmarks', () => {
    render(<LandingPage />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('links every GitHub call to action to the repository', () => {
    render(<LandingPage />);

    const starLinks = screen.getAllByRole('link', { name: /star on github/i });
    expect(starLinks.length).toBeGreaterThan(0);
    for (const link of starLinks) {
      expect(link).toHaveAttribute('href', GITHUB_URL);
    }

    const buildLinks = screen.getAllByRole('link', { name: /build from source/i });
    expect(buildLinks.length).toBeGreaterThan(0);
    for (const link of buildLinks) {
      expect(link.getAttribute('href')).toContain(GITHUB_URL);
    }
  });

  it('shows the honest "coming soon" state instead of a fake download control', () => {
    render(<LandingPage />);

    // The state exists as plain text…
    expect(screen.getAllByText(/download coming soon/i).length).toBeGreaterThan(0);

    // …and there is no interactive element pretending a download exists.
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
  });

  it('provides a skip link to the main content for keyboard users', () => {
    render(<LandingPage />);

    const skipLink = screen.getByRole('link', { name: /skip to content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});
