import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button.js';

describe('Button', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Export</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" so it cannot accidentally submit a form', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  describe('loading', () => {
    it('stays focusable so keyboard focus is not dropped mid-interaction', () => {
      render(<Button loading>Export</Button>);
      const button = screen.getByRole('button');

      // The crux: a real `disabled` attribute would remove it from the tab
      // order and strand the user's focus.
      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');

      button.focus();
      expect(button).toHaveFocus();
    });

    it('announces busy state', () => {
      render(<Button loading>Export</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });

    it('suppresses onClick, since aria-disabled has no browser behaviour', async () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Export
        </Button>,
      );

      await userEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('hides the trailing icon while loading to avoid a resize', () => {
      render(
        <Button loading trailingIcon={<svg data-testid="trailing" />}>
          Export
        </Button>,
      );
      expect(screen.queryByTestId('trailing')).not.toBeInTheDocument();
    });
  });

  describe('disabled', () => {
    it('sets the real disabled attribute', () => {
      render(<Button disabled>Export</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('does not fire onClick', async () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Export
        </Button>,
      );

      await userEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('icons', () => {
    it('hides decorative icons from assistive tech to avoid a doubled name', () => {
      render(<Button leadingIcon={<svg data-testid="icon" />}>Export</Button>);

      expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByRole('button')).toHaveAccessibleName('Export');
    });

    it('takes its accessible name from aria-label when icon-only', () => {
      render(<Button size="icon" aria-label="Split clip" leadingIcon={<svg />} />);
      expect(screen.getByRole('button', { name: 'Split clip' })).toBeInTheDocument();
    });
  });

  describe('className', () => {
    it('lets a caller override a default rather than silently losing to it', () => {
      // The reason every component funnels className through cn(): without
      // tailwind-merge, `rounded-md` and `rounded-full` would both emit and
      // CSS source order would decide.
      render(<Button className="rounded-full">Go</Button>);

      const cls = screen.getByRole('button').className;
      expect(cls).toContain('rounded-full');
      expect(cls).not.toContain('rounded-md');
    });
  });
});
