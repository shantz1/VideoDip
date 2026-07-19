import { parseTemplate, type TemplateDefinition } from '@videodip/template-engine';
import { appError, err, ok } from '@videodip/shared';
import type { PluginOperationHandler } from '../broker/broker.types.js';

/**
 * The first concrete `renderer.register` operation (ADR-0009 Phase 5, v1):
 * a plugin contributes one subtitle style template, validated against the
 * same schema `@videodip/template-engine` already enforces for built-in
 * templates before it can reach the Text styles panel.
 *
 * `onRegistered` is the host's own sink (e.g. a Zustand store action) — this
 * function only validates and hands off; it holds no state of its own.
 */
export function createSubtitleTemplateRegisterHandler(
  onRegistered: (template: TemplateDefinition) => void,
): PluginOperationHandler {
  return async (payload) => {
    const parsed = parseTemplate(payload);
    if (!parsed.ok) return parsed;
    if (parsed.value.surface !== 'subtitle') {
      return err(
        appError(
          'VALIDATION',
          `subtitle-template.register requires surface "subtitle", received "${parsed.value.surface}".`,
          'Set the template\'s surface to "subtitle".',
        ),
      );
    }
    onRegistered(parsed.value);
    return ok({ registered: true });
  };
}
