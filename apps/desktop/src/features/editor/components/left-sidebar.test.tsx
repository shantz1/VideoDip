import { fireEvent, render, screen, within } from '@testing-library/react';
import { ms, type SegmentId } from '@videodip/shared';
import { parseTemplate, resolveTemplate } from '@videodip/template-engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';
import { CAPTION_TEMPLATES, TextStylesPanel } from './left-sidebar';

const initialSubtitle = useSubtitleStore.getState();
const initialSession = useSessionStore.getState();

beforeEach(() => {
  useSubtitleStore.setState(initialSubtitle, true);
  useSessionStore.setState(initialSession, true);
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

describe('TextStylesPanel', () => {
  it('applies a template to the subtitle default style', () => {
    render(<TextStylesPanel />);
    const style = screen.getByRole('article', { name: 'Bold Impact text style' });
    fireEvent.click(within(style).getByRole('button', { name: 'Set as default' }));

    expect(useSubtitleStore.getState().document.defaultStyle).toMatchObject({
      fontFamily: 'Anton',
      foreground: '#ffde59',
      animation: 'bounce',
    });
  });

  it('Auto never repeats the template it just applied twice in a row', () => {
    render(<TextStylesPanel />);
    const auto = screen.getByRole('button', { name: 'Auto style' });

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

  it('renders a visual preview using the resolved template style', () => {
    render(<TextStylesPanel />);
    const style = screen.getByRole('article', { name: 'Bold Impact text style' });
    const preview = within(style).getByText('Your captions');

    expect(preview).toHaveStyle({ fontFamily: 'Anton', color: '#ffde59' });
    expect(preview.closest('[data-text-style-preview]')).not.toBeNull();
  });

  it('applies a style to multiple selected timeline subtitles in one history entry', () => {
    addThreeSubtitles();
    useSessionStore.getState().select({
      type: 'subtitle-segment',
      id: 'cue-a' as SegmentId,
    });
    useSessionStore.getState().toggleSelect({
      type: 'subtitle-segment',
      id: 'cue-b' as SegmentId,
    });
    const historyBefore = useSubtitleStore.getState().past.length;
    render(<TextStylesPanel />);

    const style = screen.getByRole('article', { name: 'Bold Impact text style' });
    fireEvent.click(within(style).getByRole('button', { name: 'Apply to selected (2)' }));

    expect(useSubtitleStore.getState().past).toHaveLength(historyBefore + 1);
    expect(
      useSubtitleStore.getState().document.segments.map((segment) => segment.style.fontFamily),
    ).toEqual(['Anton', 'Anton', undefined]);
  });

  it('applies a style to every current and future subtitle default in one action', () => {
    addThreeSubtitles();
    const historyBefore = useSubtitleStore.getState().past.length;
    render(<TextStylesPanel />);

    const style = screen.getByRole('article', { name: 'Bold Impact text style' });
    fireEvent.click(within(style).getByRole('button', { name: 'Apply to all' }));

    const document = useSubtitleStore.getState().document;
    expect(document.defaultStyle.fontFamily).toBe('Anton');
    expect(document.segments.every((segment) => segment.style.fontFamily === 'Anton')).toBe(true);
    expect(useSubtitleStore.getState().past).toHaveLength(historyBefore + 1);
  });

  it('selects every subtitle from the Text styles panel', () => {
    addThreeSubtitles();
    useSessionStore.getState().clearSelection();
    render(<TextStylesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

    expect(useSessionStore.getState().session.selection.refs).toHaveLength(3);
    expect(screen.getByText('3 subtitles selected')).toBeVisible();
  });
});

function addThreeSubtitles(): void {
  for (const [index, id] of ['cue-a', 'cue-b', 'cue-c'].entries()) {
    const result = useSubtitleStore.getState().add({
      id: id as SegmentId,
      start: ms(index * 2000),
      end: ms(index * 2000 + 1000),
      text: id,
    });
    if (!result.ok) throw new Error(result.error.message);
  }
}
