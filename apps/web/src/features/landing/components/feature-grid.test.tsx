import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FEATURES, PRINCIPLES } from '../landing.content';
import { FeatureGrid } from './feature-grid';
import { LocalByDesignSection } from './local-by-design-section';

describe('FeatureGrid', () => {
  it('renders a card for every shipped feature', () => {
    render(<FeatureGrid />);

    expect(FEATURES.length).toBeGreaterThan(0);
    for (const feature of FEATURES) {
      expect(screen.getByRole('heading', { level: 3, name: feature.title })).toBeInTheDocument();
    }
  });

  it('labels the section for assistive technology', () => {
    render(<FeatureGrid />);

    expect(screen.getByRole('region', { name: /already in the editor/i })).toBeInTheDocument();
  });
});

describe('LocalByDesignSection', () => {
  it('renders every local-first guarantee, including the AGPL-3.0 license', () => {
    render(<LocalByDesignSection />);

    expect(PRINCIPLES.length).toBeGreaterThan(0);
    for (const principle of PRINCIPLES) {
      expect(screen.getByRole('heading', { level: 3, name: principle.title })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 3, name: /agpl-3\.0/i })).toBeInTheDocument();
  });
});
