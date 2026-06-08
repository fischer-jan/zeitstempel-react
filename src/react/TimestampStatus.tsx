/**
 * TimestampStatus — lightweight status badge for timestamp verification.
 *
 * Displays the current verification state as a small inline badge.
 * Useful for showing timestamp status in lists or table rows.
 */

import React from 'react';
import type { VerifyResult } from '../core/types.js';

export type TimestampState = 'unknown' | 'verifying' | 'verified' | 'pending' | 'failed' | 'error';

export interface TimestampStatusProps {
  /** Current state to display. */
  state: TimestampState;
  /** Verification result for additional details (block height, etc). */
  result?: VerifyResult;
  /** Additional CSS class. */
  className?: string;
  /** Custom labels for each state. */
  labels?: Partial<Record<TimestampState, string>>;
}

const DEFAULT_LABELS: Record<TimestampState, string> = {
  unknown: 'Not verified',
  verifying: 'Verifying...',
  verified: 'Verified',
  pending: 'Pending',
  failed: 'Failed',
  error: 'Error',
};

const DEFAULT_ICONS: Record<TimestampState, string> = {
  unknown: '\u{1F6E1}',   // shield
  verifying: '\u{23F3}',  // hourglass
  verified: '\u2705',     // check
  pending: '\u{1F552}',   // clock
  failed: '\u274C',       // cross
  error: '\u26A0',        // warning
};

export function TimestampStatus({
  state,
  result,
  className = '',
  labels: customLabels,
}: TimestampStatusProps) {
  const labels = { ...DEFAULT_LABELS, ...customLabels };
  const icon = DEFAULT_ICONS[state];

  const detail = (() => {
    if (state === 'verified' && result?.status === 'verified') {
      return `Block #${result.height.toLocaleString()}`;
    }
    if (state === 'pending' && result?.status === 'pending') {
      return result.uri;
    }
    return null;
  })();

  return (
    <span className={className} title={detail || labels[state]}>
      <span>{icon}</span>
      <span>{labels[state]}</span>
      {detail && state === 'verified' && <span>{detail}</span>}
    </span>
  );
}
