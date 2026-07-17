import { appError, err, ok, type Result } from '@videodip/shared';
import { templateDefinitionSchema } from './template.schema.js';
import type {
  TemplateDefinition,
  TemplateInputs,
  TemplateParameter,
  TemplateValue,
} from './template.types.js';

const EXACT_PLACEHOLDER = /^\{\{\s*([a-z][a-zA-Z0-9._-]*)\s*\}\}$/;
const PLACEHOLDER = /\{\{\s*([a-z][a-zA-Z0-9._-]*)\s*\}\}/g;

/** Validates an unknown JSON definition before it enters a registry or project. */
export function parseTemplate(value: unknown): Result<TemplateDefinition> {
  const parsed = templateDefinitionSchema.safeParse(value);
  if (parsed.success) return ok(parsed.data as TemplateDefinition);
  return err(
    appError(
      'VALIDATION',
      `Template definition is invalid: ${parsed.error.message}`,
      'Correct the template JSON or choose another template.',
      { cause: parsed.error },
    ),
  );
}

/** Resolves parameters recursively without evaluating code or expressions. */
export function resolveTemplate(
  template: TemplateDefinition,
  requested: TemplateInputs,
): Result<TemplateValue> {
  const known = new Set(template.parameters.map((parameter) => parameter.key));
  const unknown = Object.keys(requested).find((key) => !known.has(key));
  if (unknown) {
    return err(
      appError('VALIDATION', `Unknown template parameter: ${unknown}.`, 'Remove it and retry.'),
    );
  }
  const values: Record<string, string | number | boolean> = {};
  for (const parameter of template.parameters) {
    const value = requested[parameter.key] ?? parameter.defaultValue;
    const error = validateInput(parameter, value);
    if (error) return err(error);
    if (value !== undefined) values[parameter.key] = value;
  }
  return resolveValue(template.payload, values);
}

function validateInput(parameter: TemplateParameter, value: unknown) {
  if (value === undefined) {
    return parameter.required
      ? appError(
          'VALIDATION',
          `Template parameter ${parameter.key} is required.`,
          'Provide a value.',
        )
      : undefined;
  }
  if (typeof value !== parameter.type) {
    return appError(
      'VALIDATION',
      `Template parameter ${parameter.key} has the wrong type.`,
      'Correct the value.',
    );
  }
  if (
    typeof value === 'number' &&
    ((parameter.minimum !== undefined && value < parameter.minimum) ||
      (parameter.maximum !== undefined && value > parameter.maximum))
  ) {
    return appError(
      'VALIDATION',
      `Template parameter ${parameter.key} is out of range.`,
      'Choose a permitted value.',
    );
  }
  return undefined;
}

function resolveValue(
  value: TemplateValue,
  inputs: Readonly<Record<string, string | number | boolean>>,
): Result<TemplateValue> {
  if (typeof value === 'string') {
    const exact = EXACT_PLACEHOLDER.exec(value);
    if (exact) {
      const replacement = inputs[exact[1] ?? ''];
      return replacement === undefined
        ? err(
            appError(
              'VALIDATION',
              `Template references missing parameter ${exact[1]}.`,
              'Correct the template.',
            ),
          )
        : ok(replacement);
    }
    let missing: string | undefined;
    const resolved = value.replace(PLACEHOLDER, (_match, key: string) => {
      const replacement = inputs[key];
      if (replacement === undefined) {
        missing = key;
        return '';
      }
      return String(replacement);
    });
    return missing
      ? err(
          appError(
            'VALIDATION',
            `Template references missing parameter ${missing}.`,
            'Correct the template.',
          ),
        )
      : ok(resolved);
  }
  if (Array.isArray(value)) {
    const output: TemplateValue[] = [];
    for (const item of value) {
      const resolved = resolveValue(item, inputs);
      if (!resolved.ok) return resolved;
      output.push(resolved.value);
    }
    return ok(output);
  }
  if (value !== null && typeof value === 'object') {
    const output: Record<string, TemplateValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const resolved = resolveValue(item, inputs);
      if (!resolved.ok) return resolved;
      output[key] = resolved.value;
    }
    return ok(output);
  }
  return ok(value);
}
