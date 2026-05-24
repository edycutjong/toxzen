import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ShieldedReview } from './ShieldedReview';
import type { AppealRecord } from '../../shared/types';

describe('ShieldedReview', () => {
  let fetchSpy: any;
  let alertSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
    alertSpy.mockRestore();
  });

  const mockAppeal: AppealRecord = {
    id: 'appeal-123',
    username: 'u/toxic_user',
    subreddit: 'ToxZenDemo',
    banReason: 'harassment',
    appealText: 'Please let me back.',
    submittedAt: Date.now() - 3600000, // 1h ago
    status: 'ready',
    priorBans: 3,
    analysis: {
      toxicityScore: 92,
      severity: 'extreme',
      emotionalTone: 'manipulative',
      remorseSignal: 'absent',
      shieldedSummary: 'The user is extremely toxic and shows no remorse.',
      keyPoints: ['Threatening language', 'Multiple slurs used'],
      aiConfidence: 95,
      analyzedAt: Date.now(),
    },
  };

  it('renders all shielded details correctly', () => {
    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText('Shielded Appeal Review')).toBeDefined();
    expect(screen.getByText('u/toxic_user')).toBeDefined();
    expect(screen.getByText('harassment')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined(); // Prior bans count
    expect(screen.getByText('⛔ EXTREME (92/100)')).toBeDefined();
    expect(screen.getByText('The user is extremely toxic and shows no remorse.')).toBeDefined();
    expect(screen.getByText('Threatening language')).toBeDefined();
    expect(screen.getByText('Multiple slurs used')).toBeDefined();
    
    // Remorse is split across text segments, match via regex or custom matcher
    expect(screen.getByText('Remorse')).toBeDefined();
    expect(screen.getByText(/absent/)).toBeDefined();
    expect(screen.getByText('manipulative')).toBeDefined();
    expect(screen.getByText(/95%/)).toBeDefined(); // AI confidence
  });

  it('shows low confidence warning when confidence is < 60', () => {
    const lowConfAppeal: AppealRecord = {
      ...mockAppeal,
      analysis: {
        ...mockAppeal.analysis!,
        aiConfidence: 45,
      },
    };

    render(
      <ShieldedReview
        appeal={lowConfAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText('Low confidence — verify manually')).toBeDefined();
  });

  it('handles back button click', () => {
    const onBack = vi.fn();
    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={onBack}
        onVerdictSubmitted={() => {}}
      />
    );

    const backBtn = screen.getByText('← Back to Queue');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('submits verdict successfully', async () => {
    const onVerdictSubmitted = vi.fn();
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={onVerdictSubmitted}
      />
    );

    const acceptBtn = screen.getByText('Accept');
    fireEvent.click(acceptBtn);

    expect(fetchSpy).toHaveBeenCalledWith('/api/appeal/appeal-123/verdict', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    }));

    await waitFor(() => {
      expect(onVerdictSubmitted).toHaveBeenCalledOnce();
    });
  });

  it('handles verdict submit error (already processed)', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'already_processed',
        verdict: { modUsername: 'another_mod' },
      }),
    });

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const denyBtn = screen.getByText('Deny');
    fireEvent.click(denyBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('This appeal was already processed by another_mod.');
    });
  });

  it('handles verdict submit network error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const escalateBtn = screen.getByText('Escalate');
    fireEvent.click(escalateBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Network error. Please try again.');
    });
  });

  it('reveals raw content dialog and loads raw text', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ rawText: 'This is the super toxic raw text.' }),
    });

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    // Open reveal raw content warning dialog
    const rawBtn = screen.getByText('Raw');
    fireEvent.click(rawBtn);

    // Click confirm in the warning dialog overlay
    const confirmBtn = screen.getByText('Reveal Raw Content');
    fireEvent.click(confirmBtn);

    expect(fetchSpy).toHaveBeenCalledWith('/api/appeal/appeal-123/reveal');

    await waitFor(() => {
      expect(screen.getByText('⚠️ RAW APPEAL TEXT (UNFILTERED)')).toBeDefined();
      expect(screen.getByText('This is the super toxic raw text.')).toBeDefined();
    });
  });

  it('handles reveal raw load failure', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
    });

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const rawBtn = screen.getByText('Raw');
    fireEvent.click(rawBtn);

    const confirmBtn = screen.getByText('Reveal Raw Content');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to load raw text.');
    });
  });

  it('renders already processed state and supports retrying reddit actions on failure', async () => {
    const processedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'test_mod',
        action: 'accept',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Reddit Rate Limit Exceeded',
      },
    };

    const onVerdictSubmitted = vi.fn();

    // Mock fetch for retry api
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        appeal: {
          ...processedAppeal,
          verdict: {
            ...processedAppeal.verdict!,
            redditActionStatus: 'success',
          },
        },
      }),
    });

    render(
      <ShieldedReview
        appeal={processedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={onVerdictSubmitted}
      />
    );

    expect(screen.getByText('ALREADY PROCESSED')).toBeDefined();
    expect(screen.getByText('Reddit Rate Limit Exceeded')).toBeDefined();

    const retryBtn = screen.getByText('🔄 Tap to Retry');
    fireEvent.click(retryBtn);

    expect(fetchSpy).toHaveBeenCalledWith('/api/appeal/appeal-123/retry', expect.objectContaining({
      method: 'POST',
    }));

    await waitFor(() => {
      expect(onVerdictSubmitted).toHaveBeenCalledOnce();
    });
  });

  it('renders manual review status alert', () => {
    const manualAppeal = {
      ...mockAppeal,
      status: 'manual_review' as const,
      analysis: undefined,
    };

    render(
      <ShieldedReview
        appeal={manualAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText('AI ANALYSIS UNAVAILABLE')).toBeDefined();
    expect(screen.getByText(/Manual review required/)).toBeDefined();
  });

  it('renders analyzing state message', () => {
    const analyzingAppeal = {
      ...mockAppeal,
      status: 'analyzing' as const,
      analysis: undefined,
    };

    render(
      <ShieldedReview
        appeal={analyzingAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText(/Analyzing appeal/)).toBeDefined();
  });

  it('handles general verdict submit failure (not already processed)', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'some_other_error' }),
    });

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const acceptBtn = screen.getByText('Accept');
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to submit verdict. Please try again.');
    });
  });

  it('handles retry actions error with Error instance', async () => {
    const processedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'test_mod',
        action: 'accept',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Reddit Rate Limit Exceeded',
      },
    };

    fetchSpy.mockRejectedValueOnce(new Error('Retry API down'));

    render(
      <ShieldedReview
        appeal={processedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const retryBtn = screen.getByText('🔄 Tap to Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Retry API down');
    });
  });

  it('handles retry actions error with non-Error instance', async () => {
    const processedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'test_mod',
        action: 'accept',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Reddit Rate Limit Exceeded',
      },
    };

    fetchSpy.mockRejectedValueOnce('Some raw rejection');

    render(
      <ShieldedReview
        appeal={processedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const retryBtn = screen.getByText('🔄 Tap to Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to retry actions.');
    });
  });

  it('renders already processed state with deny and escalate actions', () => {
    const deniedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'denied',
      verdict: {
        modUsername: 'test_mod',
        action: 'deny',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'spam',
        redditActionStatus: 'success',
        reason: 'Violated rule 1',
      },
    };

    const { rerender } = render(
      <ShieldedReview
        appeal={deniedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText(/Verdict: ❌ Denied/)).toBeDefined();
    expect(screen.getByText(/Reason: "Violated rule 1"/)).toBeDefined();

    const escalatedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'escalated',
      verdict: {
        modUsername: 'test_mod',
        action: 'escalate',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'escalate',
        redditActionStatus: 'success',
      },
    };

    rerender(
      <ShieldedReview
        appeal={escalatedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText(/Verdict: ⚠️ Escalated/)).toBeDefined();
  });

  it('handles verdict submit success but with failed reddit action status', async () => {
    const failedRedditVerdict: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'mod',
        action: 'accept',
        decidedAt: Date.now(),
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Failed to apply ban template on Reddit',
      },
    };

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        appeal: failedRedditVerdict,
      }),
    });

    const onVerdictSubmitted = vi.fn();

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={onVerdictSubmitted}
      />
    );

    const acceptBtn = screen.getByText('Accept');
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(onVerdictSubmitted).not.toHaveBeenCalled();
      expect(screen.getByText('REDDIT ACTION FAILED')).toBeDefined();
    });
  });

  it('handles verdict submit success without appeal field in response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
      }),
    });

    const onVerdictSubmitted = vi.fn();

    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={onVerdictSubmitted}
      />
    );

    const acceptBtn = screen.getByText('Accept');
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(onVerdictSubmitted).toHaveBeenCalledOnce();
    });
  });

  it('handles retry actions API response not ok', async () => {
    const processedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'test_mod',
        action: 'accept',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Reddit Rate Limit Exceeded',
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: false,
    });

    render(
      <ShieldedReview
        appeal={processedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const retryBtn = screen.getByText('🔄 Tap to Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to retry actions');
    });
  });

  it('handles retry actions success but action status is still failed', async () => {
    const processedAppeal: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'test_mod',
        action: 'accept',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
        errorMessage: 'Reddit Rate Limit Exceeded',
      },
    };

    const stillFailedAppeal = {
      ...processedAppeal,
      verdict: {
        ...processedAppeal.verdict!,
        redditActionStatus: 'failed',
        errorMessage: 'Still rate limited',
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        appeal: stillFailedAppeal,
      }),
    });

    const onVerdictSubmitted = vi.fn();

    render(
      <ShieldedReview
        appeal={processedAppeal}
        onBack={() => {}}
        onVerdictSubmitted={onVerdictSubmitted}
      />
    );

    const retryBtn = screen.getByText('🔄 Tap to Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(onVerdictSubmitted).not.toHaveBeenCalled();
      expect(screen.getByText('Still rate limited')).toBeDefined();
    });
  });

  it('displays medium confidence styling when confidence is between 60 and 80', () => {
    const mediumConfAppeal: AppealRecord = {
      ...mockAppeal,
      analysis: {
        ...mockAppeal.analysis!,
        aiConfidence: 75,
      },
    };

    render(
      <ShieldedReview
        appeal={mediumConfAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText(/75%/)).toBeDefined();
  });

  it('closes reveal raw dialog on cancel', () => {
    render(
      <ShieldedReview
        appeal={mockAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const rawBtn = screen.getByText('Raw');
    fireEvent.click(rawBtn);

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('Reveal Raw Content')).toBeNull();
  });

  it('renders already processed state even if verdict is missing', () => {
    const processedNoVerdict: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
    };

    render(
      <ShieldedReview
        appeal={processedNoVerdict}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText('ALREADY PROCESSED')).toBeDefined();
  });

  it('renders already processed state with failed action status and no error message using fallback', () => {
    const processedFailedNoMsg: AppealRecord = {
      ...mockAppeal,
      status: 'accepted',
      verdict: {
        modUsername: 'test_mod',
        action: 'accept',
        decidedAt: Date.now() - 10000,
        responseTemplate: 'ok',
        redditActionStatus: 'failed',
      },
    };

    render(
      <ShieldedReview
        appeal={processedFailedNoMsg}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    expect(screen.getByText('Unknown error')).toBeDefined();
  });

  it('renders with default text color if prior bans is 1 or less', () => {
    const lowBansAppeal: AppealRecord = {
      ...mockAppeal,
      priorBans: 1,
    };

    render(
      <ShieldedReview
        appeal={lowBansAppeal}
        onBack={() => {}}
        onVerdictSubmitted={() => {}}
      />
    );

    const bansValue = screen.getByText('1');
    expect(bansValue).toBeDefined();
    // In Happy DOM / React testing library inline styles can be inspected
    expect(bansValue.style.color).toBe('var(--tox-text)');
  });
});
