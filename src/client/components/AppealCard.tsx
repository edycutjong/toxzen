import React from 'react';
import type { AppealRecord } from '../../shared/types';
import { getSeverityEmoji, getRemorseEmoji, timeAgo } from '../../shared/types';
import { SeverityBadge } from './SeverityBadge';

interface AppealCardProps {
  appeal: AppealRecord;
  onClick: () => void;
}

export function AppealCard({ appeal, onClick }: AppealCardProps) {
  const severity = appeal.analysis?.severity;
  const cardClass = `card card--clickable ${
    appeal.verdict?.redditActionStatus === 'failed' ? 'card--danger' :
    severity === 'high' || severity === 'extreme' ? 'card--danger' :
    severity === 'medium' ? 'card--warn' :
    severity === 'low' ? 'card--safe' : ''
  }`;

  return (
    <div className={cardClass} onClick={onClick}>
      <div className="appeal-card">
        {/* Header: Badge + Username + Time */}
        <div className="appeal-card__header">
          {appeal.verdict?.redditActionStatus === 'failed' && (
            <span className="severity-badge" style={{ background: 'var(--tox-danger-glow)', color: 'var(--tox-danger)', border: '1px solid rgba(239,68,68,0.3)' }}>
              ⚠️ RETRY NEEDED
            </span>
          )}
          {appeal.analysis && appeal.verdict?.redditActionStatus !== 'failed' && (
            <SeverityBadge severity={appeal.analysis.severity} score={appeal.analysis.toxicityScore} />
          )}
          {appeal.status === 'analyzing' && (
            <span className="severity-badge" style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--tox-zen)', border: '1px solid rgba(6,182,212,0.3)' }}>
              ⏳ ANALYZING
            </span>
          )}
          {appeal.status === 'pending' && (
            <span className="severity-badge" style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--tox-muted)', border: '1px solid rgba(148,163,184,0.3)' }}>
              ⏳ PENDING
            </span>
          )}
          {appeal.status === 'manual_review' && (
            <span className="severity-badge" style={{ background: 'var(--tox-warn-glow)', color: 'var(--tox-warn)', border: '1px solid rgba(245,158,11,0.3)' }}>
              ⚠️ MANUAL
            </span>
          )}
          <span className="appeal-card__username">{appeal.username}</span>
          <span className="appeal-card__time">{timeAgo(appeal.submittedAt)}</span>
        </div>

        {/* Summary */}
        {appeal.verdict?.redditActionStatus === 'failed' ? (
          <div className="appeal-card__summary" style={{ color: 'var(--tox-danger)' }}>
            Reddit Action Failed: {appeal.verdict.errorMessage || 'Unknown error'}
          </div>
        ) : (
          appeal.analysis && (
            <div className="appeal-card__summary">{appeal.analysis.shieldedSummary}</div>
          )
        )}

        {appeal.status === 'analyzing' && (
          <div className="appeal-card__summary" style={{ color: 'var(--tox-zen)' }}>
            AI shield processing in progress...
          </div>
        )}

        {appeal.status === 'manual_review' && (
          <div className="appeal-card__summary" style={{ color: 'var(--tox-warn)' }}>
            AI analysis unavailable. Manual review required.
          </div>
        )}

        {/* Meta */}
        {appeal.analysis && (
          <div className="appeal-card__meta">
            <span>Remorse: {getRemorseEmoji(appeal.analysis.remorseSignal)} {appeal.analysis.remorseSignal}</span>
            {appeal.priorBans && <span>Prior bans: {appeal.priorBans}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
