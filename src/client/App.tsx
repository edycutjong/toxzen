import React, { useState, useEffect, useCallback } from 'react';
import type { AppealRecord, DailyStats, AppealsListResponse } from '../shared/types';
import { QueueView } from './components/QueueView';
import { ShieldedReview } from './components/ShieldedReview';
import { WellnessDashboard } from './components/WellnessDashboard';

type View = 'queue' | 'review' | 'wellness';

export function App() {
  const [view, setView] = useState<View>(() => {
    // Detect which entry point we're in from the URL
    const path = window.location.pathname;
    if (path.includes('review')) return 'review';
    if (path.includes('wellness')) return 'wellness';
    return 'queue';
  });

  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [stats, setStats] = useState<DailyStats>({
    date: new Date().toISOString().split('T')[0],
    processed: 0, accepted: 0, denied: 0, escalated: 0, wordsShielded: 0,
  });
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch appeals data
  const fetchAppeals = useCallback(async () => {
    try {
      const response = await fetch('/api/appeals');
      if (!response.ok) throw new Error('Failed to fetch appeals');
      const data: AppealsListResponse = await response.json();
      setAppeals(data.appeals);
      setStats(data.stats);
      setError(null);
    } catch (_err) {
      setError('Failed to load appeals. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 5 seconds
  useEffect(() => {
    fetchAppeals();
    const interval = setInterval(fetchAppeals, 5000);
    return () => clearInterval(interval);
  }, [fetchAppeals]);

  // Handle appeal selection
  const handleSelectAppeal = useCallback((appealId: string) => {
    setSelectedAppealId(appealId);
    setView('review');
  }, []);

  // Handle back to queue
  const handleBack = useCallback(() => {
    setSelectedAppealId(null);
    setView('queue');
    fetchAppeals(); // Refresh data
  }, [fetchAppeals]);

  // Handle verdict submitted
  const handleVerdictSubmitted = useCallback(() => {
    fetchAppeals(); // Refresh data
    handleBack();
  }, [fetchAppeals, handleBack]);

  // Seed demo data handler
  const handleSeedDemoData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/seed', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to seed data');
      await fetchAppeals();
    } catch (_err) {
      setError('Failed to seed demo data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchAppeals]);

  // Get selected appeal
  const selectedAppeal = appeals.find(a => a.id === selectedAppealId);

  return (
    <div className="toxzen-app">
      {view === 'queue' && (
        <QueueView
          appeals={appeals}
          stats={stats}
          loading={loading}
          error={error}
          onSelectAppeal={handleSelectAppeal}
          onOpenWellness={() => setView('wellness')}
          onSeedDemoData={handleSeedDemoData}
        />
      )}

      {view === 'review' && selectedAppeal && (
        <ShieldedReview
          appeal={selectedAppeal}
          onBack={handleBack}
          onVerdictSubmitted={handleVerdictSubmitted}
        />
      )}

      {view === 'wellness' && (
        <WellnessDashboard
          stats={stats}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
