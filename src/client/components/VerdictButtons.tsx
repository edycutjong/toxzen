import React from 'react';

interface VerdictButtonsProps {
  disabled: boolean;
  submitting: boolean;
  onAccept: () => void;
  onDeny: () => void;
  onEscalate: () => void;
  onRevealRaw: () => void;
}

export function VerdictButtons({ disabled, submitting, onAccept, onDeny, onEscalate, onRevealRaw }: VerdictButtonsProps) {
  return (
    <div className="verdict-buttons">
      <button
        className="verdict-btn verdict-btn--accept"
        disabled={disabled}
        onClick={onAccept}
      >
        <span className="verdict-btn__icon">✅</span>
        {submitting ? '...' : 'Accept'}
      </button>

      <button
        className="verdict-btn verdict-btn--deny"
        disabled={disabled}
        onClick={onDeny}
      >
        <span className="verdict-btn__icon">❌</span>
        {submitting ? '...' : 'Deny'}
      </button>

      <button
        className="verdict-btn verdict-btn--escalate"
        disabled={disabled}
        onClick={onEscalate}
      >
        <span className="verdict-btn__icon">⚠️</span>
        {submitting ? '...' : 'Escalate'}
      </button>

      <button
        className="verdict-btn verdict-btn--reveal"
        disabled={disabled}
        onClick={onRevealRaw}
      >
        <span className="verdict-btn__icon">👁</span>
        Raw
      </button>
    </div>
  );
}
