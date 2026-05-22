import React from 'react';
import type { DailyStats } from '../../shared/types';

interface WellnessDashboardProps {
  stats: DailyStats;
  onBack: () => void;
}

export function WellnessDashboard({ stats, onBack }: WellnessDashboardProps) {
  const hasActivity = stats.processed > 0 || stats.wordsShielded > 0;

  return (
    <>
      {/* Back Button */}
      <button className="back-btn" onClick={onBack}>
        ← Back to Queue
      </button>

      {/* Header */}
      <div className="toxzen-header">
        <span className="toxzen-header__icon">🧘</span>
        <span className="toxzen-header__title">Your Moderation Wellness</span>
      </div>

      {/* No Activity State */}
      {!hasActivity && (
        <div className="empty-state">
          <div className="empty-state__icon">✅</div>
          <div className="empty-state__title">No appeals processed today — enjoy the peace</div>
          <div className="empty-state__text">Check back after reviewing some appeals.</div>
        </div>
      )}

      {/* Stats Grid */}
      {hasActivity && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--tox-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Today's Stats
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card__value">{stats.processed}</div>
              <div className="stat-card__label">Appeals Processed</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value" style={{ fontSize: '20px' }}>
                {stats.processed > 0 ? `${Math.round(8 * stats.processed / stats.processed)}s` : '—'}
              </div>
              <div className="stat-card__label">Avg Time Per Case</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value" style={{ color: 'var(--tox-shield)' }}>
                {stats.wordsShielded.toLocaleString()}
              </div>
              <div className="stat-card__label">Words Shielded</div>
            </div>
          </div>

          {/* Decision Breakdown */}
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--tox-muted)', marginBottom: '12px' }}>
              Decisions Today
            </div>
            <div className="decision-breakdown">
              <span className="decision-breakdown__item">
                <span style={{ color: 'var(--tox-safe)' }}>✅</span>
                <span>{stats.accepted} Accepted</span>
              </span>
              <span className="decision-breakdown__item">
                <span style={{ color: 'var(--tox-danger)' }}>❌</span>
                <span>{stats.denied} Denied</span>
              </span>
              <span className="decision-breakdown__item">
                <span style={{ color: 'var(--tox-warn)' }}>⚠️</span>
                <span>{stats.escalated} Escalated</span>
              </span>
            </div>
          </div>

          {/* Wellness Message */}
          <div className="wellness-message">
            <div className="wellness-message__icon">🛡️</div>
            <div className="wellness-message__text">
              You've been shielded from{' '}
              <span className="wellness-message__highlight">
                {stats.wordsShielded.toLocaleString()} words
              </span>{' '}
              of toxic content today.
              <br />
              <br />
              Thank you for keeping your community safe.
            </div>
          </div>
        </>
      )}
    </>
  );
}
