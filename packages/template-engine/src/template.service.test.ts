import { describe, expect, it } from 'vitest';
import { parseTemplate, resolveTemplate } from './index.js';

const definition = {
  version: 1,
  id: 'subtitle.pop',
  name: 'Pop caption',
  description: 'Bold caption data.',
  surface: 'subtitle',
  parameters: [
    { key: 'size', label: 'Size', type: 'number', required: true, minimum: 8, maximum: 200 },
    { key: 'bold', label: 'Bold', type: 'boolean', required: false, defaultValue: true },
  ],
  payload: { style: { fontSize: '{{size}}', isBold: '{{bold}}' }, label: 'Caption {{size}}' },
} as const;

describe('template engine', () => {
  it('validates and deterministically resolves JSON templates', () => {
    const parsed = parseTemplate(definition);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(resolveTemplate(parsed.value, { size: 64 })).toEqual({
      ok: true,
      value: { style: { fontSize: 64, isBold: true }, label: 'Caption 64' },
    });
  });

  it('rejects duplicate parameters, unknown inputs, and invalid ranges', () => {
    expect(
      parseTemplate({
        ...definition,
        parameters: [definition.parameters[0], definition.parameters[0]],
      }).ok,
    ).toBe(false);
    const parsed = parseTemplate(definition);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(resolveTemplate(parsed.value, { size: 500 }).ok).toBe(false);
    expect(resolveTemplate(parsed.value, { size: 64, unknown: true }).ok).toBe(false);
  });
});
