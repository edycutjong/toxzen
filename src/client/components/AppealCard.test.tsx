import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AppealCard } from './AppealCard';
import type { AppealRecord } from '../../shared/types';

describe('AppealCard', () => {
  afterEach(() => {
    cleanup();
  });

  const mockAppeal: AppealRecord = {
    id: '1',
    username: 'u/test_user',
    subreddit: 't5_abc12',
    banReason: 'spam',
    appealText: 'Please unban me.',
    submittedAt: Date.now() - 60000, // 1m ago
    status: 'analyzing',
    priorBans: 2,
  };

  it('renders analyzing state correctly', () => {
    render(<AppealCard appeal={mockAppeal} onClick={() => {}} />);
    expect(screen.getByText('⏳ ANALYZING')).toBeDefined();
    expect(screen.getByText('AI shield processing in progress...')).toBeDefined();
    expect(screen.getByText('u/test_user')).toBeDefined();
    expect(screen.getByText('1m ago')).toBeDefined();
  });

  it('renders pending status badge correctly', () => {
    const pendingAppeal = { ...mockAppeal, status: 'pending' as const };
    render(<AppealCard appeal={pendingAppeal} onClick={() => {}} />);
    expect(screen.getByText('⏳ PENDING')).toBeDefined();
  });

  it('renders manual review state correctly', () => {
    const manualAppeal = { ...mockAppeal, status: 'manual_review' as const };
    render(<AppealCard appeal={manualAppeal} onClick={() => {}} />);
    expect(screen.getByText('⚠️ MANUAL')).toBeDefined();
    expect(screen.getByText('AI analysis unavailable. Manual review required.')).toBeDefined();
  });

  it('renders analyzed state (high severity) and metadata', () => {
    const analyzedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'ready',
      analysis: {
        toxicityScore: 85,
        severity: 'high',
        emotionalTone: 'angry',
        remorseSignal: 'genuine',
        shieldedSummary: 'The user is high threat.',
        keyPoints: [],
        aiConfidence: 90,
        analyzedAt: Date.now(),
      },
    };

    render(<AppealCard appeal={analyzedAppeal} onClick={() => {}} />);
    expect(screen.getByText('🔴 HIGH (85/100)')).toBeDefined();
    expect(screen.getByText('The user is high threat.')).toBeDefined();
    expect(screen.getByText('Remorse: ✅ genuine')).toBeDefined();
    expect(screen.getByText('Prior bans: 2')).toBeDefined();
  });

  it('renders failed action state correctly', () => {
    const failedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'mod',
        action: 'accept',
        decidedAt: Date.now(),
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Reddit API Rate Limit',
      },
    };

    render(<AppealCard appeal={failedAppeal} onClick={() => {}} />);
    expect(screen.getByText('⚠️ RETRY NEEDED')).toBeDefined();
    expect(screen.getByText('Reddit Action Failed: Reddit API Rate Limit')).toBeDefined();
  });

  it('triggers onClick callback when card is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<AppealCard appeal={mockAppeal} onClick={onClick} />);
    
    const card = container.querySelector('.card');
    expect(card).not.toBeNull();
    if (card) {
      fireEvent.click(card);
    }
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders analyzed state with success verdict correctly', () => {
    const successVerdictAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      analysis: {
        toxicityScore: 20,
        severity: 'low',
        emotionalTone: 'remorseful',
        remorseSignal: 'genuine',
        shieldedSummary: 'User is remorseful.',
        keyPoints: [],
        aiConfidence: 95,
        analyzedAt: Date.now(),
      },
      verdict: {
        modUsername: 'mod_1',
        action: 'accept',
        decidedAt: Date.now(),
        responseTemplate: 'ok',
        redditActionStatus: 'success',
      },
    };
    render(<AppealCard appeal={successVerdictAppeal} onClick={() => {}} />);
    expect(screen.getByText('🟢 LOW (20/100)')).toBeDefined();
  });

  it('renders failed action state without error message using fallback', () => {
    const failedAppealNoMsg: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'mod',
        action: 'accept',
        decidedAt: Date.now(),
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
      },
    };

    render(<AppealCard appeal={failedAppealNoMsg} onClick={() => {}} />);
    expect(screen.getByText('⚠️ RETRY NEEDED')).toBeDefined();
    expect(screen.getByText('Reddit Action Failed: Unknown error')).toBeDefined();
  });
});
