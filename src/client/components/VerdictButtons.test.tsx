import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VerdictButtons } from './VerdictButtons';

describe('VerdictButtons', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all buttons and handles click events', () => {
    const onAccept = vi.fn();
    const onDeny = vi.fn();
    const onEscalate = vi.fn();
    const onRevealRaw = vi.fn();

    render(
      <VerdictButtons
        disabled={false}
        submitting={false}
        onAccept={onAccept}
        onDeny={onDeny}
        onEscalate={onEscalate}
        onRevealRaw={onRevealRaw}
      />
    );

    const acceptBtn = screen.getByText('Accept');
    const denyBtn = screen.getByText('Deny');
    const escalateBtn = screen.getByText('Escalate');
    const revealBtn = screen.getByText('Raw');

    expect(acceptBtn).toBeDefined();
    expect(denyBtn).toBeDefined();
    expect(escalateBtn).toBeDefined();
    expect(revealBtn).toBeDefined();

    fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledOnce();

    fireEvent.click(denyBtn);
    expect(onDeny).toHaveBeenCalledOnce();

    fireEvent.click(escalateBtn);
    expect(onEscalate).toHaveBeenCalledOnce();

    fireEvent.click(revealBtn);
    expect(onRevealRaw).toHaveBeenCalledOnce();
  });

  it('disables buttons when disabled is true', () => {
    render(
      <VerdictButtons
        disabled={true}
        submitting={false}
        onAccept={() => {}}
        onDeny={() => {}}
        onEscalate={() => {}}
        onRevealRaw={() => {}}
      />
    );

    const acceptBtn = screen.getByText('Accept') as HTMLButtonElement;
    const denyBtn = screen.getByText('Deny') as HTMLButtonElement;
    const escalateBtn = screen.getByText('Escalate') as HTMLButtonElement;
    const revealBtn = screen.getByText('Raw') as HTMLButtonElement;

    expect(acceptBtn.disabled).toBe(true);
    expect(denyBtn.disabled).toBe(true);
    expect(escalateBtn.disabled).toBe(true);
    expect(revealBtn.disabled).toBe(true);
  });

  it('shows submitting indicator when submitting is true', () => {
    render(
      <VerdictButtons
        disabled={false}
        submitting={true}
        onAccept={() => {}}
        onDeny={() => {}}
        onEscalate={() => {}}
        onRevealRaw={() => {}}
      />
    );

    // Submitting button names will be changed to "..." (except for Raw which is static "Raw")
    const dotsButtons = screen.getAllByText('...');
    expect(dotsButtons.length).toBe(3);

    const rawBtn = screen.getByText('Raw');
    expect(rawBtn).toBeDefined();
  });
});
