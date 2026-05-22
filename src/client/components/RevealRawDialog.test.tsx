import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RevealRawDialog } from './RevealRawDialog';

describe('RevealRawDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, content, buttons and triggers confirm/cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <RevealRawDialog
        onConfirm={onConfirm}
        onCancel={onCancel}
        loading={false}
      />
    );

    expect(screen.getByText('⚠️ Content Warning')).toBeDefined();
    expect(screen.getByText(/This will reveal the/)).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    const confirmBtn = screen.getByText('Reveal Raw Content');

    expect(cancelBtn).toBeDefined();
    expect(confirmBtn).toBeDefined();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledOnce();

    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('triggers cancel on overlay click', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <RevealRawDialog
        onConfirm={() => {}}
        onCancel={onCancel}
        loading={false}
      />
    );

    const overlay = container.querySelector('.dialog-overlay');
    expect(overlay).not.toBeNull();
    if (overlay) {
      fireEvent.click(overlay);
    }
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not trigger cancel when clicking dialog itself', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <RevealRawDialog
        onConfirm={() => {}}
        onCancel={onCancel}
        loading={false}
      />
    );

    const dialog = container.querySelector('.dialog');
    expect(dialog).not.toBeNull();
    if (dialog) {
      fireEvent.click(dialog);
    }
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables buttons and shows loading text when loading is true', () => {
    render(
      <RevealRawDialog
        onConfirm={() => {}}
        onCancel={() => {}}
        loading={true}
      />
    );

    const cancelBtn = screen.getByText('Cancel') as HTMLButtonElement;
    const loadingTextBtn = screen.getByText('Loading...') as HTMLButtonElement;

    expect(cancelBtn.disabled).toBe(true);
    expect(loadingTextBtn.disabled).toBe(true);
  });
});
