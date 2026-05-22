import React from 'react';

interface RevealRawDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function RevealRawDialog({ onConfirm, onCancel, loading }: RevealRawDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog__title">⚠️ Content Warning</div>
        <div className="dialog__text">
          This will reveal the <strong>unfiltered, raw appeal text</strong> which may contain:
          <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
            <li>Profanity and slurs</li>
            <li>Personal attacks</li>
            <li>Threatening language</li>
            <li>Disturbing content</li>
          </ul>
          <div style={{ marginTop: '12px' }}>
            This content was hidden to protect your mental health. Are you sure you want to proceed?
          </div>
        </div>
        <div className="dialog__actions">
          <button className="dialog__btn" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="dialog__btn dialog__btn--danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Loading...' : 'Reveal Raw Content'}
          </button>
        </div>
      </div>
    </div>
  );
}
