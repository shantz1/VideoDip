import type { TemplateId } from '@videodip/shared';

/** Serializable value accepted in a template definition or resolved payload. */
export type TemplateValue =
  | string
  | number
  | boolean
  | null
  | readonly TemplateValue[]
  | { readonly [key: string]: TemplateValue };

export type TemplateSurface = 'project' | 'subtitle' | 'transition' | 'effect' | 'export-preset';

export interface TemplateParameter {
  readonly key: string;
  readonly label: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly required: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly minimum?: number;
  readonly maximum?: number;
}

/** Data-only template definition; executable source is deliberately forbidden. */
export interface TemplateDefinition {
  readonly version: 1;
  readonly id: TemplateId;
  readonly name: string;
  readonly description: string;
  readonly surface: TemplateSurface;
  readonly parameters: readonly TemplateParameter[];
  readonly payload: TemplateValue;
}

export type TemplateInputs = Readonly<Record<string, string | number | boolean>>;
