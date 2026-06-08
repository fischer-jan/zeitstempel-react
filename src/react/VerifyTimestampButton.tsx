/**
 * VerifyTimestampButton — a generic timestamp verification button.
 *
 * Shows verification status with visual feedback. Calls an async
 * onVerify callback and displays the result. No theme or i18n
 * dependencies — style via className props.
 */

import React, { useState, type ReactNode } from 'react';
import type { VerifyResult } from '../core/types.js';

export type VerifyStatus = 'idle' | 'verifying' | 'verified' | 'pending' | 'failed' | 'error';

export interface VerifyTimestampButtonProps {
  /** Async function that performs verification and returns results. */
  onVerify: () => Promise<VerifyResult[]>;
  /** Button size. */
  size?: 'sm' | 'md';
  /** Show text label next to icon. */
  showLabel?: boolean;
  /** Custom labels for each status. */
  labels?: Partial<Record<VerifyStatus, string>>;
  /** Additional CSS class for the wrapper. */
  className?: string;
  /** Render custom content instead of default icon + label. */
  children?: (status: VerifyStatus, results: VerifyResult[] | null) => ReactNode;
}

const DEFAULT_LABELS: Record<VerifyStatus, string> = {
  idle: 'Verify',
  verifying: 'Verifying...',
  verified: 'Verified',
  pending: 'Pending',
  failed: 'Failed',
  error: 'Error',
};

/** Map VerifyResult[] to a single display status. */
function summarizeResults(results: VerifyResult[]): VerifyStatus {
  if (results.some(r => r.status === 'verified')) return 'verified';
  if (results.some(r => r.status === 'pending')) return 'pending';
  if (results.some(r => r.status === 'failed')) return 'failed';
  return 'error';
}

/**
 * Inline SVG icons. Sized in `em` so they inherit the surrounding
 * font-size by default (no CSS framework required); pass `size` or a
 * `className` to override.
 */
interface IconProps {
  className?: string;
  size?: string;
}

/** Simple shield icon as inline SVG. */
function ShieldIcon({ className, size = '1em' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/** Simple check icon. */
function CheckIcon({ className, size = '1em' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Simple clock icon. */
function ClockIcon({ className, size = '1em' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

const STATUS_ICONS: Record<VerifyStatus, typeof ShieldIcon> = {
  idle: ShieldIcon,
  verifying: ClockIcon,
  verified: CheckIcon,
  pending: ClockIcon,
  failed: ShieldIcon,
  error: ShieldIcon,
};

export function VerifyTimestampButton({
  onVerify,
  size = 'sm',
  showLabel = false,
  labels: customLabels,
  className = '',
  children,
}: VerifyTimestampButtonProps) {
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [results, setResults] = useState<VerifyResult[] | null>(null);

  const labels = { ...DEFAULT_LABELS, ...customLabels };

  const handleClick = async () => {
    if (status === 'verifying') return;

    setStatus('verifying');
    setResults(null);

    try {
      const verifyResults = await onVerify();
      setResults(verifyResults);
      setStatus(summarizeResults(verifyResults));
    } catch (err) {
      setResults(null);
      setStatus('error');
    }
  };

  const isClickable = status === 'idle' || status === 'error' || status === 'failed';
  const Icon = STATUS_ICONS[status];
  const iconSize = size === 'md' ? '1.25em' : '1em';

  // Get the first verified result for display
  const verifiedResult = results?.find(r => r.status === 'verified');

  const tooltip = (() => {
    if (status === 'verified' && verifiedResult && verifiedResult.status === 'verified') {
      return `Verified at Bitcoin block #${verifiedResult.height.toLocaleString()}`;
    }
    return labels[status];
  })();

  // If custom children renderer is provided, use it
  if (children) {
    return (
      <button
        onClick={isClickable ? handleClick : undefined}
        disabled={status === 'verifying'}
        className={className}
        title={tooltip}
        aria-label={tooltip}
      >
        {children(status, results)}
      </button>
    );
  }

  return (
    <button
      onClick={isClickable ? handleClick : undefined}
      disabled={status === 'verifying'}
      className={className}
      title={tooltip}
      aria-label={tooltip}
    >
      <Icon size={iconSize} />
      {showLabel && <span>{labels[status]}</span>}
      {status === 'verified' && verifiedResult && verifiedResult.status === 'verified' && (
        <span>#{verifiedResult.height.toLocaleString()}</span>
      )}
    </button>
  );
}
