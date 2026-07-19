import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUBTITLE_FONTS, SubtitleColorInput } from './subtitle-style-inspector';

describe('DEFAULT_SUBTITLE_FONTS', () => {
  it('offers the bundled caption font pack alongside the offline system generics', () => {
    const systemFonts = DEFAULT_SUBTITLE_FONTS.filter((font) => font.source === 'system');
    const bundledFonts = DEFAULT_SUBTITLE_FONTS.filter((font) => font.source === 'bundled');
    expect(systemFonts.length).toBeGreaterThanOrEqual(4);
    expect(bundledFonts.map((font) => font.family)).toEqual(
      expect.arrayContaining(['Poppins', 'Anton', 'Bebas Neue', 'Permanent Marker']),
    );
    // Every option must have a unique id — the FontPicker keys its list on it.
    const ids = DEFAULT_SUBTITLE_FONTS.map((font) => font.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('SubtitleColorInput', () => {
  it('stays controlled without remounting and commits once after many preview events', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const rendered = render(
      <SubtitleColorInput
        label="Caption color"
        value="#112233"
        onPreview={onPreview}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    const input = rendered.getByLabelText('Caption color');

    fireEvent.input(input, { target: { value: '#223344' } });
    fireEvent.input(input, { target: { value: '#334455' } });
    fireEvent.input(input, { target: { value: '#445566' } });
    expect(onPreview).toHaveBeenCalledTimes(3);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '#445566' } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.getByLabelText('Caption color')).toBe(input);

    rendered.rerender(
      <SubtitleColorInput
        label="Caption color"
        value="#445566"
        onPreview={onPreview}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    expect(rendered.getByLabelText('Caption color')).toBe(input);
    expect(input).toHaveValue('#445566');
  });

  it('does not feed duplicate native input events back into a controlled parent', () => {
    const onPreview = vi.fn();

    function ControlledColor() {
      const [value, setValue] = useState('#112233');
      return (
        <SubtitleColorInput
          label="Caption color"
          value={value}
          onPreview={(next) => {
            onPreview(next);
            setValue(next);
          }}
          onCommit={vi.fn()}
          onCancel={vi.fn()}
        />
      );
    }

    const rendered = render(<ControlledColor />);
    const input = rendered.getByLabelText('Caption color');
    fireEvent.input(input, { target: { value: '#223344' } });
    fireEvent.input(input, { target: { value: '#223344' } });

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(rendered.getByLabelText('Caption color')).toBe(input);
    expect(input).toHaveValue('#223344');
  });
});
