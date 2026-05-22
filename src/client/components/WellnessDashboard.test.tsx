import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WellnessDashboard } from './WellnessDashboard';
import type { DailyStats } from '../../shared/types';

describe('WellnessDashboard', () => {
  afterEach(() => {
    cleanup();
  });

  const emptyStats: DailyStats = {
    date: '2026-05-22',
    processed: 0,
    accepted: 0,
    denied: 0,
    escalated: 0,
    wordsShielded: 0,
  };

  const activeStats: DailyStats = {
    date: '2026-05-22',
    processed: 5,
    accepted: 2,
    denied: 2,
    escalated: 1,
    wordsShielded: 1250,
  };

  it('renders empty stats / no activity state correctly', () => {
    render(<WellnessDashboard stats={emptyStats} onBack={() => {}} />);
    expect(screen.getByText('No appeals processed today — enjoy the peace')).toBeDefined();
    expect(screen.getByText('Check back after reviewing some appeals.')).toBeDefined();
  });

  it('renders active stats dashboard correctly', () => {
    render(<WellnessDashboard stats={activeStats} onBack={() => {}} />);

    // Check header
    expect(screen.getByText('Your Moderation Wellness')).toBeDefined();

    // Check stats grid values
    expect(screen.getByText('5')).toBeDefined(); // Processed count
    expect(screen.getByText('1,250')).toBeDefined(); // Words shielded in stat card

    // Check decisions
    expect(screen.getByText('2 Accepted')).toBeDefined();
    expect(screen.getByText('2 Denied')).toBeDefined();
    expect(screen.getByText('1 Escalated')).toBeDefined();

    // Check wellness message highlighting
    expect(screen.getByText('1,250 words')).toBeDefined();
  });

  it('renders dashboard with zero processed but words shielded correctly', () => {
    const specialStats: DailyStats = {
      date: '2026-05-22',
      processed: 0,
      accepted: 0,
      denied: 0,
      escalated: 0,
      wordsShielded: 100,
    };

    render(<WellnessDashboard stats={specialStats} onBack={() => {}} />);

    // Check stats grid values
    expect(screen.getByText('0')).toBeDefined(); // Processed count
    expect(screen.getByText('—')).toBeDefined(); // Avg time fallback
    expect(screen.getByText('100')).toBeDefined(); // Words shielded in stat card
  });

  it('triggers onBack callback when back button is clicked', () => {
    const onBack = vi.fn();
    render(<WellnessDashboard stats={emptyStats} onBack={onBack} />);

    const backBtn = screen.getByText('← Back to Queue');
    expect(backBtn).toBeDefined();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
