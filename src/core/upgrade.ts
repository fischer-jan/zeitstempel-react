/**
 * Upgrade logic — replace pending calendar attestations with
 * completed Bitcoin proofs.
 *
 * Ported from zeitstempel's upgrade.rs.
 *
 * When you stamp data, the calendar server returns a "pending" attestation.
 * After a few hours (1-3 Bitcoin blocks), the proof chain is complete.
 * The upgrade function contacts the calendar server and fetches the
 * completed sub-tree.
 */

import { applyOperation } from './operations.js';
import { parseTimestampFromBytes } from './parser.js';
import { bytesToHex } from './hex.js';
import type { OtsFile, Timestamp, Attestation, Operation, UpgradeResult } from './types.js';

const MAX_DEPTH = 256;

/**
 * Try to upgrade all pending attestations in an OTS proof.
 *
 * Modifies the OtsFile in place and returns statistics.
 */
export async function upgradeProof(ots: OtsFile): Promise<UpgradeResult> {
  const result: UpgradeResult = {
    upgraded: 0,
    stillPending: 0,
    errors: [],
    alreadyComplete: false,
  };

  if (!hasPendingAttestation(ots.timestamp)) {
    result.alreadyComplete = true;
    return result;
  }

  await upgradeTimestamp(ots.timestamp, ots.fileDigest, result, 0);
  return result;
}

// ── Internal tree walker ──────────────────────────────────────────

async function upgradeTimestamp(
  ts: Timestamp,
  msg: Uint8Array,
  result: UpgradeResult,
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) {
    result.errors.push('Proof tree exceeds maximum depth');
    return;
  }

  const newAttestations: Attestation[] = [];
  const newOps: [Operation, Timestamp][] = [];

  // Process pending attestations
  for (const att of ts.attestations) {
    if (att.type === 'pending') {
      try {
        const subTree = await fetchUpgrade(att.uri, msg);
        if (subTree) {
          newAttestations.push(...subTree.attestations);
          newOps.push(...subTree.ops);
          result.upgraded++;
        } else {
          newAttestations.push(att);
          result.stillPending++;
        }
      } catch (e) {
        newAttestations.push(att);
        result.errors.push(e instanceof Error ? e.message : String(e));
      }
    } else {
      newAttestations.push(att);
    }
  }

  // Snapshot original ops before mutation — iterating a mutated
  // array would accidentally recurse into the newly added ops.
  const originalOps = [...ts.ops];

  ts.attestations = newAttestations;
  ts.ops.push(...newOps);

  // Recurse into original operation children only
  for (const [op, child] of originalOps) {
    try {
      const newMsg = await applyOperation(op, msg);
      await upgradeTimestamp(child, newMsg, result, depth + 1);
    } catch (e) {
      result.errors.push(`Operation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * Contact the calendar server and try to fetch the completed proof.
 * Returns null if still pending (404).
 */
async function fetchUpgrade(uri: string, msg: Uint8Array): Promise<Timestamp | null> {
  const url = `${uri.replace(/\/+$/, '')}/timestamp/${bytesToHex(msg)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.opentimestamps.v1',
      'User-Agent': 'zeitstempel',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  // Cap the response at 1 MiB. Real calendar responses are ~4 KB; anything
  // multi-megabyte is either a buggy server or a hostile one trying to
  // OOM a browser tab. Mirrors the Rust port's `take(1_048_576)`.
  const MAX_RESPONSE_BYTES = 1_048_576;
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error(`Calendar response too large (${contentLength} bytes) from ${url}`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Calendar response too large (${body.byteLength} bytes) from ${url}`);
  }
  if (body.byteLength === 0) {
    return null;
  }

  return parseTimestampFromBytes(new Uint8Array(body));
}

function hasPendingAttestation(ts: Timestamp): boolean {
  for (const att of ts.attestations) {
    if (att.type === 'pending') return true;
  }
  for (const [, child] of ts.ops) {
    if (hasPendingAttestation(child)) return true;
  }
  return false;
}

