import { fireEvent, render, screen } from '@testing-library/react';
import { parseTemplate, resolveTemplate } from '@videodip/template-engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSubtitleStore } from '../subtitle.store';
import { CAPTION_TEMPLATES, TemplatesPanel } from './left-sidebar';

const initialSubtitle = useSubtitleStore.getState();

beforeEach(() => {
  useSubtitleStore.setState(initialSubtitle, true);
});

describe('CAPTION_TEMPLATES', () => {
  it('is data every entry resolves as a valid partial subtitle style', () => {
    for (const template of CAPTION_TEMPLATES) {
      const parsed = parseTemplate(template);
      expect(parsed.ok, `${template.id} should parse`).toBe(true);
      if (!parsed.ok) continue;
      const resolved = resolveTemplate(parsed.value, {});
      expect(resolved.ok, `${template.id} should resolve`).toBe(true);
    }
  });

  it('has unique, stable ids', () => {
    const ids = CAPTION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('TemplatesPanel', () => {
  it('applies a template to the subtitle default style', () => {
    render(<TemplatesPanel />);
    fireEvent.click(screen.getByText('Bold Impact'));

    expect(useSubtitleStore.getState().document.defaultStyle).toMatchObject({
      fontFamily: 'Anton',
      foreground: '#ffde59',
      animation: 'bounce',
    });
  });

  it('Auto never repeats the template it just applied twice in a row', () => {
    render(<TemplatesPanel />);
    const auto = screen.getByRole('button', { name: 'Auto' });

    const seen: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(auto);
      // Compare the whole resolved style, not one field: a later template
      // can leave an earlier field untouched (partial payloads merge onto
      // the current style), so only the full style reliably distinguishes
      // "a different template was applied" from "this field didn't change".
      seen.push(JSON.stringify(useSubtitleStore.getState().document.defaultStyle));
    }
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });
});
