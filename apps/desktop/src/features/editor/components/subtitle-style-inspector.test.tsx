import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubtitleColorInput } from './subtitle-style-inspector';

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
});
