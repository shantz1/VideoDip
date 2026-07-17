import { describe, expect, it } from 'vitest';
import {
  fpsSchema,
  framesSchema,
  mediaLocatorSchema,
  millisecondsSchema,
  normalizedSchema,
  projectIdSchema,
} from './primitive.schema.js';

describe('unit boundary schemas', () => {
  it('accepts valid finite units', () => {
    expect(millisecondsSchema.parse(1_000)).toBe(1_000);
    expect(framesSchema.parse(30)).toBe(30);
    expect(fpsSchema.parse(29.97)).toBe(29.97);
    expect(normalizedSchema.parse(0.5)).toBe(0.5);
  });

  it('rejects invalid values instead of silently branding or clamping them', () => {
    expect(millisecondsSchema.safeParse(-1).success).toBe(false);
    expect(millisecondsSchema.safeParse(Number.NaN).success).toBe(false);
    expect(framesSchema.safeParse(1.5).success).toBe(false);
    expect(fpsSchema.safeParse(0).success).toBe(false);
    expect(normalizedSchema.safeParse(1.1).success).toBe(false);
  });
});

describe('identifier boundary schemas', () => {
  it('trims and brands non-empty identifiers', () => {
    expect(projectIdSchema.parse('  project-a  ')).toBe('project-a');
    expect(mediaLocatorSchema.parse('  opfs://asset-a  ')).toBe('opfs://asset-a');
  });

  it('rejects empty identifiers', () => {
    expect(projectIdSchema.safeParse('   ').success).toBe(false);
  });
});
