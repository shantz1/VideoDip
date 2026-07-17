import { templateIdSchema } from '@videodip/shared';
import { z } from 'zod';

export const templateValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(100_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(templateValueSchema).max(10_000),
    z.record(z.string().trim().min(1).max(256), templateValueSchema),
  ]),
);

export const templateParameterSchema = z
  .strictObject({
    key: z.string().regex(/^[a-z][a-zA-Z0-9._-]{0,127}$/),
    label: z.string().trim().min(1).max(128),
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean(),
    defaultValue: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
  })
  .superRefine((parameter, context) => {
    if (parameter.defaultValue !== undefined && typeof parameter.defaultValue !== parameter.type) {
      context.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'Default type must match.',
      });
    }
    if (
      parameter.minimum !== undefined &&
      parameter.maximum !== undefined &&
      parameter.minimum > parameter.maximum
    ) {
      context.addIssue({ code: 'custom', path: ['minimum'], message: 'Minimum exceeds maximum.' });
    }
  });

export const templateDefinitionSchema = z
  .strictObject({
    version: z.literal(1),
    id: templateIdSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000),
    surface: z.enum(['project', 'subtitle', 'transition', 'effect', 'export-preset']),
    parameters: z.array(templateParameterSchema).max(128),
    payload: templateValueSchema,
  })
  .superRefine((template, context) => {
    const keys = new Set<string>();
    for (const [index, parameter] of template.parameters.entries()) {
      if (keys.has(parameter.key)) {
        context.addIssue({
          code: 'custom',
          path: ['parameters', index, 'key'],
          message: 'Duplicate key.',
        });
      }
      keys.add(parameter.key);
    }
  });
