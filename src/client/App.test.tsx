import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from './App';
import type { AppealsListResponse } from '../shared/types';

describe('App', () => {
  let fetchSpy: any;

  const mockData: AppealsListResponse = {
    appeals: [
      {
        id: '1',
        username: 'u/user_1',
        subreddit: 'ToxZenDemo',
        appealText: 'App 1',
        banReason: 'spam',
        submittedAt: Date.now(),
        status: 'ready',
        analysis: {
          toxicityScore: 90,
          severity: 'high',
          emotionalTone: 'manipulative',
          remorseSignal: 'absent',
          shieldedSummary: 'Toxic summary',
          keyPoints: [],
          aiConfidence: 95,
          analyzedAt: Date.now(),
        },
      },
    ],
    stats: {
      date: '2026-05-22',
      processed: 5,
      accepted: 2,
      denied: 2,
      escalated: 1,
      wordsShielded: 1000,
    },
  };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Default mock response for initial data load
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
    // Clean up location pathname to root
    window.history.pushState({}, '', '/');
  });

  it('mounts and loads queue data', async () => {
    render(<App />);

    expect(fetchSpy).toHaveBeenCalledWith('/api/appeals');

    // Wait for the data to load and render
    await waitFor(() => {
      expect(screen.getByText('ToxZen — Ban Appeal Queue')).toBeDefined();
      expect(screen.getByText('u/user_1')).toBeDefined();
      expect(screen.getByText('Today: 5')).toBeDefined();
    });
  });

  it('registers periodic polling interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('u/user_1')).toBeDefined();
    });

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    setIntervalSpy.mockRestore();
  });

  it('handles navigation to wellness dashboard and back to queue', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('u/user_1')).toBeDefined();
    });

    // Go to wellness
    const statsBtn = screen.getByText('📊');
    fireEvent.click(statsBtn);

    expect(screen.getByText('Your Moderation Wellness')).toBeDefined();

    // Go back to queue
    const backBtn = screen.getByText('← Back to Queue');
    fireEvent.click(backBtn);

    expect(screen.getByText('ToxZen — Ban Appeal Queue')).toBeDefined();
  });

  it('handles navigation to review details, submitting a verdict and coming back to queue', async () => {
    // Mock verdict post response
    fetchSpy.mockImplementation((url: string) => {
      if (url === '/api/appeals') {
        return Promise.resolve({
          ok: true,
          json: async () => mockData,
        });
      }
      if (url.includes('/verdict')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            appeal: {
              ...mockData.appeals[0],
              status: 'accepted',
              verdict: {
                modUsername: 'mod',
                action: 'accept',
                decidedAt: Date.now(),
                responseTemplate: 'ok',
                redditActionStatus: 'success',
              },
            },
          }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('u/user_1')).toBeDefined();
    });

    // Select appeal card
    const card = screen.getByText('u/user_1');
    fireEvent.click(card);

    expect(screen.getByText('Shielded Appeal Review')).toBeDefined();

    // Submit accept verdict
    const acceptBtn = screen.getByText('Accept');
    fireEvent.click(acceptBtn);

    // Should return to queue
    await waitFor(() => {
      expect(screen.getByText('ToxZen — Ban Appeal Queue')).toBeDefined();
    });
  });

  it('handles API fetch errors gracefully', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load appeals. Please refresh.')).toBeDefined();
    });
  });

  it('detects review view from URL pathname', async () => {
    window.history.pushState({}, '', '/review/123');

    render(<App />);

    // Since we're in review view, but no selectedAppealId is set, it will fallback to queue or review screen
    // Wait, let's see how it behaves:
    // If pathname has review, view is set to 'review'. But selectedAppeal is appeals.find(a => a.id === selectedAppealId).
    // selectedAppealId is null, so selectedAppeal is undefined.
    // The render returns empty (no view matches because selectedAppeal is falsy in: view === 'review' && selectedAppeal).
    // Let's verify that the queue is NOT rendered.
    expect(screen.queryByText('ToxZen — Ban Appeal Queue')).toBeNull();
  });

  it('detects wellness view from URL pathname', async () => {
    window.history.pushState({}, '', '/wellness');

    render(<App />);

    // Since we're in wellness view, it should show wellness dashboard after loading
    await waitFor(() => {
      expect(screen.getByText('Your Moderation Wellness')).toBeDefined();
    });
  });

  it('handles API fetch error when response is not ok', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load appeals. Please refresh.')).toBeDefined();
    });
  });
});
