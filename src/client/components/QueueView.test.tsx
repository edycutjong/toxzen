import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueueView } from './QueueView';
import type { AppealRecord, DailyStats } from '../../shared/types';

describe('QueueView', () => {
  afterEach(() => {
    cleanup();
  });

  const mockStats: DailyStats = {
    date: '2026-05-22',
    processed: 10,
    accepted: 5,
    denied: 3,
    escalated: 2,
    wordsShielded: 450,
  };

  it('renders loading state correctly', () => {
    render(
      <QueueView
        appeals={[]}
        stats={mockStats}
        loading={true}
        error={null}
        onSelectAppeal={() => {}}
        onOpenWellness={() => {}}
        onSeedDemoData={() => {}}
      />
    );

    expect(screen.getByText('Loading appeals...')).toBeDefined();
  });

  it('renders error state correctly', () => {
    render(
      <QueueView
        appeals={[]}
        stats={mockStats}
        loading={false}
        error="Network timeout"
        onSelectAppeal={() => {}}
        onOpenWellness={() => {}}
        onSeedDemoData={() => {}}
      />
    );

    expect(screen.getByText('Network timeout')).toBeDefined();
  });

  it('renders empty state correctly', () => {
    render(
      <QueueView
        appeals={[]}
        stats={mockStats}
        loading={false}
        error={null}
        onSelectAppeal={() => {}}
        onOpenWellness={() => {}}
        onSeedDemoData={() => {}}
      />
    );

    expect(screen.getByText('All clear.')).toBeDefined();
    expect(screen.getByText('No pending ban appeals. Your community is at peace.')).toBeDefined();
  });

  it('renders multiple appeals and severity counts correctly', () => {
    const appeals: AppealRecord[] = [
      {
        id: '1',
        username: 'u/user_1',
        subreddit: 'ToxZenDemo',
        appealText: 'App 1',
        banReason: 'spam',
        submittedAt: Date.now(),
        status: 'ready',
        analysis: {
          toxicityScore: 95,
          severity: 'extreme',
          emotionalTone: 'manipulative',
          shieldedSummary: 'extreme toxic',
          keyPoints: ['point 1'],
          aiConfidence: 90,
          analyzedAt: Date.now(),
          remorseSignal: 'absent',
        },
      },
      {
        id: '2',
        username: 'u/user_2',
        subreddit: 'ToxZenDemo',
        appealText: 'App 2',
        banReason: 'harassment',
        submittedAt: Date.now(),
        status: 'ready',
        analysis: {
          toxicityScore: 50,
          severity: 'medium',
          emotionalTone: 'neutral',
          shieldedSummary: 'medium toxic',
          keyPoints: ['point 2'],
          aiConfidence: 80,
          analyzedAt: Date.now(),
          remorseSignal: 'performative',
        },
      },
      {
        id: '3',
        username: 'u/user_3',
        subreddit: 'ToxZenDemo',
        appealText: 'App 3',
        banReason: 'none',
        submittedAt: Date.now(),
        status: 'ready',
        analysis: {
          toxicityScore: 10,
          severity: 'low',
          emotionalTone: 'remorseful',
          shieldedSummary: 'low toxic',
          keyPoints: ['point 3'],
          aiConfidence: 95,
          analyzedAt: Date.now(),
          remorseSignal: 'genuine',
        },
      },
    ];

    const onSelectAppeal = vi.fn();
    const onOpenWellness = vi.fn();

    render(
      <QueueView
        appeals={appeals}
        stats={mockStats}
        loading={false}
        error={null}
        onSelectAppeal={onSelectAppeal}
        onOpenWellness={onOpenWellness}
        onSeedDemoData={() => {}}
      />
    );

    // Checks severity summaries: 1 high/extreme, 1 medium, 1 low
    expect(screen.getByText('🔴 1 HIGH')).toBeDefined();
    expect(screen.getByText('🟡 1 MED')).toBeDefined();
    expect(screen.getByText('🟢 1 LOW')).toBeDefined();

    // Checks footer stats
    expect(screen.getByText('📊 Pending: 3')).toBeDefined();
    expect(screen.getByText('Today: 10')).toBeDefined();
    expect(screen.getByText('🛡️ 450w')).toBeDefined();

    // Trigger select appeal
    const firstUserCard = screen.getByText('u/user_1');
    fireEvent.click(firstUserCard);
    expect(onSelectAppeal).toHaveBeenCalledWith('1');

    // Trigger wellness view open
    const statsBtn = screen.getByText('📊');
    fireEvent.click(statsBtn);
    expect(onOpenWellness).toHaveBeenCalledOnce();
  });

  it('correctly filters actionable appeals and excludes non-actionable ones', () => {
    const appeals: AppealRecord[] = [
      { id: '1', username: 'u/user_analyzing', subreddit: 'Sub', banReason: 'none', appealText: 'text', submittedAt: Date.now(), status: 'analyzing' },
      { id: '2', username: 'u/user_manual', subreddit: 'Sub', banReason: 'none', appealText: 'text', submittedAt: Date.now(), status: 'manual_review' },
      { id: '3', username: 'u/user_pending', subreddit: 'Sub', banReason: 'none', appealText: 'text', submittedAt: Date.now(), status: 'pending' },
      {
        id: '4',
        username: 'u/user_failed_reddit',
        subreddit: 'Sub',
        banReason: 'none',
        appealText: 'text',
        submittedAt: Date.now(),
        status: 'accepted',
        verdict: { modUsername: 'mod', action: 'accept', decidedAt: Date.now(), responseTemplate: 'ok', redditActionStatus: 'failed' }
      },
      {
        id: '5',
        username: 'u/user_success_reddit',
        subreddit: 'Sub',
        banReason: 'none',
        appealText: 'text',
        submittedAt: Date.now(),
        status: 'accepted',
        verdict: { modUsername: 'mod', action: 'accept', decidedAt: Date.now(), responseTemplate: 'ok', redditActionStatus: 'success' }
      }
    ];

    render(
      <QueueView
        appeals={appeals}
        stats={mockStats}
        loading={false}
        error={null}
        onSelectAppeal={() => {}}
        onOpenWellness={() => {}}
        onSeedDemoData={() => {}}
      />
    );

    // actionable ones should render
    expect(screen.queryByText('u/user_analyzing')).not.toBeNull();
    expect(screen.queryByText('u/user_manual')).not.toBeNull();
    expect(screen.queryByText('u/user_pending')).not.toBeNull();
    expect(screen.queryByText('u/user_failed_reddit')).not.toBeNull();
    
    // completed successful ones should not render
    expect(screen.queryByText('u/user_success_reddit')).toBeNull();
  });

  it('calls onSeedDemoData when clicking seed button in empty state', () => {
    const onSeedDemoData = vi.fn();
    render(
      <QueueView
        appeals={[]}
        stats={mockStats}
        loading={false}
        error={null}
        onSelectAppeal={() => {}}
        onOpenWellness={() => {}}
        onSeedDemoData={onSeedDemoData}
      />
    );

    const seedBtn = screen.getByText('🌱 Seed Demo Data');
    fireEvent.click(seedBtn);
    expect(onSeedDemoData).toHaveBeenCalledOnce();
  });
});
