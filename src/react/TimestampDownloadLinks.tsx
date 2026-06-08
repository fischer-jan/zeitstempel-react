/**
 * TimestampDownloadLinks — download links for external verification.
 *
 * Provides downloads for a content hash file and .ots proof, plus a
 * link to opentimestamps.org. Implements the double-hash privacy
 * architecture where only a hash (not the original data) is uploaded
 * for external verification.
 *
 * No theme or i18n dependencies — style via className props.
 */

import React from 'react';

export interface TimestampData {
  /** SHA256 of the original data (64 hex characters). */
  contentHash: string;
  /** Base64-encoded .ots proof bytes. */
  otsProof: string;
  /** SHA256 of contentHash — shown in technical details if provided. */
  timestampHash?: string;
}

export interface TimestampDownloadLinksProps {
  /** Timestamp data to download. */
  timestamp: TimestampData;
  /** Prefix for downloaded filenames. */
  filenamePrefix?: string;
  /** Additional CSS class for the wrapper. */
  className?: string;
  /** Use compact layout (icons only). */
  compact?: boolean;
  /** Custom labels. */
  labels?: {
    hashFile?: string;
    proofFile?: string;
    verifyAt?: string;
    technicalDetails?: string;
    explanation?: string;
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function downloadFile(content: string | Uint8Array, filename: string, mimeType = 'application/octet-stream') {
  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Inline SVG icons, sized in `em` so they inherit the surrounding
 * font-size by default (no CSS framework required).
 */
interface IconProps {
  className?: string;
  size?: string;
}

/** Simple download icon. */
function DownloadIcon({ className, size = '1em' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Simple external link icon. */
function ExternalLinkIcon({ className, size = '1em' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function TimestampDownloadLinks({
  timestamp,
  filenamePrefix = 'timestamp',
  className = '',
  compact = false,
  labels = {},
}: TimestampDownloadLinksProps) {
  if (!timestamp?.contentHash || !timestamp?.otsProof) {
    return null;
  }

  const {
    hashFile = 'Hash file',
    proofFile = '.ots proof',
    verifyAt = 'Verify at',
    technicalDetails = 'Technical details',
    explanation = 'Download files below and verify at opentimestamps.org. No sensitive data is shared.',
  } = labels;

  const handleDownloadHash = () => {
    downloadFile(timestamp.contentHash, `${filenamePrefix}-hash.txt`, 'text/plain');
  };

  const handleDownloadProof = () => {
    const proofBytes = base64ToBytes(timestamp.otsProof);
    downloadFile(proofBytes, `${filenamePrefix}.ots`);
  };

  const handleOpenVerifier = () => {
    window.open('https://opentimestamps.org', '_blank', 'noopener,noreferrer');
  };

  if (compact) {
    return (
      <div className={className}>
        <button onClick={handleDownloadHash} title="Download hash for verification">
          <DownloadIcon />
        </button>
        <button onClick={handleDownloadProof} title="Download .ots proof">
          <DownloadIcon />
        </button>
        <button onClick={handleOpenVerifier} title="Verify at opentimestamps.org">
          <ExternalLinkIcon />
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p>{explanation}</p>

      <div>
        <button onClick={handleDownloadHash}>
          <DownloadIcon />
          {hashFile}
        </button>
        <button onClick={handleDownloadProof}>
          <DownloadIcon />
          {proofFile}
        </button>
      </div>

      <div>
        <span>{verifyAt}</span>
        <button onClick={handleOpenVerifier}>
          opentimestamps.org
          <ExternalLinkIcon />
        </button>
      </div>

      <details>
        <summary>{technicalDetails}</summary>
        <div>
          <div><strong>contentHash:</strong> {timestamp.contentHash}</div>
          {timestamp.timestampHash && (
            <div><strong>timestampHash:</strong> {timestamp.timestampHash}</div>
          )}
        </div>
      </details>
    </div>
  );
}
