import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SeverityBadge } from './SeverityBadge';

describe('SeverityBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders low severity correctly', () => {
    render(<SeverityBadge severity="low" score={15} />);
    const badge = screen.getByText(/LOW/);
    expect(badge).toBeDefined();
    expect(badge.className).toContain('severity-badge--low');
    expect(screen.getByText(/🟢 LOW \(15\/100\)/)).toBeDefined();
  });

  it('renders medium severity correctly', () => {
    render(<SeverityBadge severity="medium" score={50} />);
    const badge = screen.getByText(/MEDIUM/);
    expect(badge).toBeDefined();
    expect(badge.className).toContain('severity-badge--medium');
    expect(screen.getByText(/🟡 MEDIUM \(50\/100\)/)).toBeDefined();
  });

  it('renders high severity correctly', () => {
    render(<SeverityBadge severity="high" score={80} />);
    const badge = screen.getByText(/HIGH/);
    expect(badge).toBeDefined();
    expect(badge.className).toContain('severity-badge--high');
    expect(screen.getByText(/🔴 HIGH \(80\/100\)/)).toBeDefined();
  });

  it('renders extreme severity correctly', () => {
    render(<SeverityBadge severity="extreme" score={95} />);
    const badge = screen.getByText(/EXTREME/);
    expect(badge).toBeDefined();
    expect(badge.className).toContain('severity-badge--extreme');
    expect(screen.getByText(/⛔ EXTREME \(95\/100\)/)).toBeDefined();
  });
});
