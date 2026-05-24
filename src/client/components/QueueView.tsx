import React from 'react';
import type { AppealRecord, DailyStats } from '../../shared/types';
import { AppealCard } from './AppealCard';

interface QueueViewProps {
  appeals: AppealRecord[];
  stats: DailyStats;
  loading: boolean;
  error: string | null;
  onSelectAppeal: (id: string) => void;
  onOpenWellness: () => void;
  onSeedDemoData: () => void;
}

export function QueueView({ appeals, stats, loading, error, onSelectAppeal, onOpenWellness, onSeedDemoData }: QueueViewProps) {
  // Filter to actionable appeals (or appeals with failed reddit actions)
  const pendingAppeals = appeals.filter(
    a => a.status === 'ready' || a.status === 'analyzing' || a.status === 'manual_review' || a.status === 'pending' || a.verdict?.redditActionStatus === 'failed'
  );

  // Count by severity
  const highCount = pendingAppeals.filter(a => {
    const s = a.analysis?.severity;
    return s === 'high' || s === 'extreme';
  }).length;
  const medCount = pendingAppeals.filter(a => a.analysis?.severity === 'medium').length;
  const lowCount = pendingAppeals.filter(a => a.analysis?.severity === 'low').length;

  return (
    <>
      {/* Header */}
      <div className="toxzen-header">
        <span className="toxzen-header__icon">🧘</span>
        <span className="toxzen-header__title">
          <span className="logo-tox">Tox</span><span className="logo-zen">Zen</span> — Ban Appeal Queue
        </span>
        <button
          className="back-btn"
          style={{ marginBottom: 0, marginLeft: 'auto' }}
          onClick={onOpenWellness}
        >
          📊
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="alert alert--warning">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-state__text">Loading appeals...</div>
        </div>
      )}

      {/* Empty State */}
      {!loading && pendingAppeals.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">✅</div>
          <div className="empty-state__title">All clear.</div>
          <div className="empty-state__text" style={{ marginBottom: '16px' }}>No pending ban appeals. Your community is at peace.</div>
          <button
            className="back-btn"
            style={{ width: 'auto', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            onClick={onSeedDemoData}
          >
            🌱 Seed Demo Data
          </button>
        </div>
      )}

      {/* Severity Summary */}
      {!loading && pendingAppeals.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {highCount > 0 && (
            <span className="severity-badge severity-badge--high">🔴 {highCount} HIGH</span>
          )}
          {medCount > 0 && (
            <span className="severity-badge severity-badge--medium">🟡 {medCount} MED</span>
          )}
          {lowCount > 0 && (
            <span className="severity-badge severity-badge--low">🟢 {lowCount} LOW</span>
          )}
        </div>
      )}

      {/* Appeal Cards */}
      {!loading && pendingAppeals.map(appeal => (
        <AppealCard
          key={appeal.id}
          appeal={appeal}
          onClick={() => onSelectAppeal(appeal.id)}
        />
      ))}

      {/* Footer Stats */}
      <div className="footer-stats">
        <span className="footer-stats__item">
          📊 Pending: {pendingAppeals.length}
        </span>
        <span className="footer-stats__item">
          Today: {stats.processed}
        </span>
        <span className="footer-stats__item">
          🛡️ {stats.wordsShielded.toLocaleString()}w
        </span>
      </div>
    </>
  );
}
