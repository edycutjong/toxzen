import React from 'react';
import type { Severity } from '../../shared/types';
import { getSeverityEmoji } from '../../shared/types';

interface SeverityBadgeProps {
  severity: Severity;
  score: number;
}

export function SeverityBadge({ severity, score }: SeverityBadgeProps) {
  const label = severity.toUpperCase();
  const emoji = getSeverityEmoji(severity);

  return (
    <span className={`severity-badge severity-badge--${severity}`}>
      {emoji} {label} ({score}/100)
    </span>
  );
}
