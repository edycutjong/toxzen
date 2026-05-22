import React, { useState, useEffect, useCallback } from 'react';
import type { AppealRecord } from '../../shared/types';
import { getSeverityEmoji, getRemorseEmoji, timeAgo } from '../../shared/types';
import { SeverityBadge } from './SeverityBadge';
import { VerdictButtons } from './VerdictButtons';
import { RevealRawDialog } from './RevealRawDialog';

interface ShieldedReviewProps {
  appeal: AppealRecord;
  onBack: () => void;
  onVerdictSubmitted: () => void;
}

export function ShieldedReview({ appeal, onBack, onVerdictSubmitted }: ShieldedReviewProps) {
  const [localAppeal, setLocalAppeal] = useState<AppealRecord>(appeal);
  const [showRawDialog, setShowRawDialog] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [submittingVerdict, setSubmittingVerdict] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setLocalAppeal(appeal);
  }, [appeal]);

  const isProcessed = localAppeal.status === 'accepted' || localAppeal.status === 'denied' || localAppeal.status === 'escalated';
  const isAnalyzing = localAppeal.status === 'analyzing' || localAppeal.status === 'pending';
  const isManualReview = localAppeal.status === 'manual_review';

  // Handle verdict
  const handleVerdict = useCallback(async (action: 'accept' | 'deny' | 'escalate') => {
    setSubmittingVerdict(true);
    try {
      const response = await fetch(`/api/appeal/${localAppeal.id}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.error === 'already_processed') {
          alert(`This appeal was already processed by ${error.verdict?.modUsername}.`);
        } else {
          alert('Failed to submit verdict. Please try again.');
        }
        return;
      }

      const data = await response.json();
      if (data.success && data.appeal) {
        setLocalAppeal(data.appeal);
        if (data.appeal.verdict?.redditActionStatus === 'failed') {
          // Stay on screen to show the failure alert
        } else {
          onVerdictSubmitted();
        }
      } else {
        onVerdictSubmitted();
      }
    } catch (_err) {
      alert('Network error. Please try again.');
    } finally {
      setSubmittingVerdict(false);
    }
  }, [localAppeal.id, onVerdictSubmitted]);

  // Handle retry actions
  const handleRetryActions = useCallback(async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/appeal/${localAppeal.id}/retry`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to retry actions');
      const data = await response.json();
      if (data.success && data.appeal) {
        setLocalAppeal(data.appeal);
        if (data.appeal.verdict?.redditActionStatus === 'success') {
          onVerdictSubmitted();
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry actions.');
    } finally {
      setRetrying(false);
    }
  }, [localAppeal.id, onVerdictSubmitted]);

  // Handle reveal raw
  const handleRevealRaw = useCallback(async () => {
    setLoadingRaw(true);
    try {
      const response = await fetch(`/api/appeal/${localAppeal.id}/reveal`);
      if (!response.ok) throw new Error('Failed to fetch raw text');
      const data = await response.json();
      setRawText(data.rawText);
    } catch (_err) {
      alert('Failed to load raw text.');
    } finally {
      setLoadingRaw(false);
      setShowRawDialog(false);
    }
  }, [localAppeal.id]);

  // Confidence bar color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'var(--tox-safe)';
    if (confidence >= 60) return 'var(--tox-warn)';
    return 'var(--tox-danger)';
  };

  return (
    <>
      {/* Back Button */}
      <button className="back-btn" onClick={onBack}>
        ← Back to Queue
      </button>

      {/* Header */}
      <div className="toxzen-header">
        <span className="toxzen-header__icon">🛡️</span>
        <span className="toxzen-header__title">Shielded Appeal Review</span>
      </div>

      {/* Already Processed State */}
      {isProcessed && (
        <div className="card">
          <div className="alert alert--info">
            <span>ℹ️</span>
            <div>
              <strong>ALREADY PROCESSED</strong>
              <div style={{ marginTop: '4px' }}>
                Verdict: {localAppeal.verdict?.action === 'accept' ? '✅ Accepted' :
                         localAppeal.verdict?.action === 'deny' ? '❌ Denied' : '⚠️ Escalated'}
                <br />
                By: {localAppeal.verdict?.modUsername} • {localAppeal.verdict ? timeAgo(localAppeal.verdict.decidedAt) : ''}
                {localAppeal.verdict?.reason && <><br />Reason: "{localAppeal.verdict.reason}"</>}
              </div>
            </div>
          </div>

          {localAppeal.verdict?.redditActionStatus === 'failed' && (
            <div className="alert alert--danger" style={{ marginTop: '12px' }}>
              <span>⚠️</span>
              <div>
                <strong>REDDIT ACTION FAILED</strong>
                <div style={{ marginTop: '4px' }}>
                  The automatic actions on Reddit failed:
                  <br />
                  <code style={{ fontSize: '11px', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '4px' }}>
                    {localAppeal.verdict.errorMessage || 'Unknown error'}
                  </code>
                </div>
                <button
                  className="alert-retry-btn"
                  onClick={handleRetryActions}
                  disabled={retrying}
                >
                  {retrying ? '🔄 Retrying...' : '🔄 Tap to Retry'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analyzing State */}
      {isAnalyzing && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div className="loading-spinner" />
            <div className="loading-state__text" style={{ marginTop: '12px' }}>
              ⏳ Analyzing appeal...<br />
              AI shield processing in progress.<br />
              This usually takes 2–4 seconds.
            </div>
          </div>
        </div>
      )}

      {/* Manual Review State */}
      {isManualReview && (
        <div className="alert alert--warning">
          <span>⚠️</span>
          <div>
            <strong>AI ANALYSIS UNAVAILABLE</strong>
            <div style={{ marginTop: '4px' }}>
              Manual review required for this appeal. Raw content is hidden — click 👁 to reveal.
            </div>
          </div>
        </div>
      )}

      {/* Main Review Card */}
      <div className="card">
        {/* User Info */}
        <div className="detail-row">
          <span className="detail-row__label">User</span>
          <span className="detail-row__value">{localAppeal.username}</span>
        </div>
        <div className="detail-row">
          <span className="detail-row__label">Submitted</span>
          <span className="detail-row__value">{timeAgo(localAppeal.submittedAt)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-row__label">Ban Reason</span>
          <span className="detail-row__value">{localAppeal.banReason}</span>
        </div>
        {localAppeal.priorBans !== undefined && (
          <div className="detail-row">
            <span className="detail-row__label">Prior Bans</span>
            <span className="detail-row__value" style={{ color: localAppeal.priorBans > 1 ? 'var(--tox-danger)' : 'var(--tox-text)' }}>
              {localAppeal.priorBans}
            </span>
          </div>
        )}

        {/* Severity */}
        {localAppeal.analysis && (
          <div className="detail-row">
            <span className="detail-row__label">Toxicity</span>
            <SeverityBadge severity={localAppeal.analysis.severity} score={localAppeal.analysis.toxicityScore} />
          </div>
        )}
      </div>

      {/* Shielded Summary */}
      {localAppeal.analysis && (
        <div className="shield-section">
          <div className="shield-section__header">
            <span>🛡️</span>
            <span>AI SHIELDED SUMMARY</span>
          </div>
          <div className="shield-section__text">{localAppeal.analysis.shieldedSummary}</div>
        </div>
      )}

      {/* Key Points */}
      {localAppeal.analysis?.keyPoints && localAppeal.analysis.keyPoints.length > 0 && (
        <div className="card">
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--tox-muted)', marginBottom: '8px' }}>
            Key Points
          </div>
          <ul className="key-points">
            {localAppeal.analysis.keyPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Remorse & Confidence */}
      {localAppeal.analysis && (
        <div className="card">
          <div className="detail-row">
            <span className="detail-row__label">Remorse</span>
            <span className="detail-row__value">
              {getRemorseEmoji(localAppeal.analysis.remorseSignal)} {localAppeal.analysis.remorseSignal}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-row__label">Emotional Tone</span>
            <span className="detail-row__value">{localAppeal.analysis.emotionalTone}</span>
          </div>
          <div className="detail-row" style={{ borderBottom: 'none' }}>
            <span className="detail-row__label">AI Confidence</span>
            <span className="detail-row__value" style={{ color: getConfidenceColor(localAppeal.analysis.aiConfidence) }}>
              {localAppeal.analysis.aiConfidence}%
            </span>
          </div>
          <div className="confidence-bar">
            <div
              className="confidence-bar__fill"
              style={{
                width: `${localAppeal.analysis.aiConfidence}%`,
                background: getConfidenceColor(localAppeal.analysis.aiConfidence),
              }}
            />
          </div>
          {localAppeal.analysis.aiConfidence < 60 && (
            <div className="alert alert--warning" style={{ marginTop: '8px', marginBottom: 0 }}>
              <span>⚠️</span>
              <span>Low confidence — verify manually</span>
            </div>
          )}
        </div>
      )}

      {/* Revealed Raw Text */}
      {rawText && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--tox-danger)', marginBottom: '8px' }}>
            ⚠️ RAW APPEAL TEXT (UNFILTERED)
          </div>
          <div className="raw-content">{rawText}</div>
        </div>
      )}

      {/* Verdict Buttons */}
      {!isProcessed && (
        <VerdictButtons
          disabled={isAnalyzing || submittingVerdict}
          submitting={submittingVerdict}
          onAccept={() => handleVerdict('accept')}
          onDeny={() => handleVerdict('deny')}
          onEscalate={() => handleVerdict('escalate')}
          onRevealRaw={() => setShowRawDialog(true)}
        />
      )}

      {/* Reveal Raw Dialog */}
      {showRawDialog && (
        <RevealRawDialog
          onConfirm={handleRevealRaw}
          onCancel={() => setShowRawDialog(false)}
          loading={loadingRaw}
        />
      )}
    </>
  );
}
