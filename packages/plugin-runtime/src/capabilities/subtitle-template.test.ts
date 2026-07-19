import { describe, expect, it, vi } from 'vitest';
import { createSubtitleTemplateRegisterHandler } from './subtitle-template.js';

const validTemplate = {
  version: 1,
  id: 'plugin.example.bold' as never,
  name: 'Plugin Bold',
  description: 'A plugin-contributed style.',
  surface: 'subtitle',
  parameters: [],
  payload: { fontFamily: 'Anton', foreground: '#ffde59' },
};

describe('createSubtitleTemplateRegisterHandler', () => {
  it('registers a valid subtitle-surface template', async () => {
    const onRegistered = vi.fn();
    const handler = createSubtitleTemplateRegisterHandler(onRegistered);

    const result = await handler(validTemplate);

    expect(result.ok).toBe(true);
    expect(onRegistered).toHaveBeenCalledWith(validTemplate);
  });

  it('rejects a payload that fails template schema validation', async () => {
    const onRegistered = vi.fn();
    const handler = createSubtitleTemplateRegisterHandler(onRegistered);

    const result = await handler({ not: 'a template' });

    expect(result.ok).toBe(false);
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('rejects a template whose surface is not "subtitle"', async () => {
    const onRegistered = vi.fn();
    const handler = createSubtitleTemplateRegisterHandler(onRegistered);

    const result = await handler({ ...validTemplate, surface: 'transition' });

    expect(result.ok).toBe(false);
    expect(onRegistered).not.toHaveBeenCalled();
  });
});
