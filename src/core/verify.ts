/**
 * Verification logic — hash the input, walk the proof tree,
 * and check attestations against the Bitcoin blockchain.
 *
 * Ported from zeitstempel's verify.rs (~164 lines → ~120 TS lines).
 */

import { parseOts } from './parser.js';
import { applyOperation, hashContents } from './operations.js';
import { getBlockInfo, merkleRootToLeBytes } from './bitcoin.js';
import { bytesToHex, hexToBytes, constantTimeEqual } from './hex.js';
import type { Timestamp, Attestation, VerifyResult } from './types.js';

const MAX_DEPTH = 256;

/**
 * Verify a file against its .ots proof.
 * Returns one VerifyResult per attestation path in the proof tree.
 */
export async function verifyFile(
  fileData: Uint8Array,
  otsData: Uint8Array,
): Promise<VerifyResult[]> {
  const ots = parseOts(otsData);

  // Hash the input file
  const computedDigest = await hashContents(fileData, ots.hashOp);

  // Compare digests
  if (!constantTimeEqual(computedDigest, ots.fileDigest)) {
    throw new Error(
      `File digest mismatch!\n` +
      `  Expected (from .ots): ${bytesToHex(ots.fileDigest)}\n` +
      `  Computed (from file): ${bytesToHex(computedDigest)}\n` +
      `  This .ots proof is for a different file.`
    );
  }

  // Walk the proof tree
  return walkTimestamp(ots.timestamp, ots.fileDigest, 0);
}

/**
 * Verify an .ots proof against a pre-computed digest (hex string).
 *
 * Use this when you already have the hash that was stamped (e.g.,
 * from a database field) and don't have the original file data.
 * The digest is compared directly against the .ots file's stored
 * digest without re-hashing.
 */
export async function verifyDigest(
  digestHex: string,
  otsData: Uint8Array,
): Promise<VerifyResult[]> {
  const ots = parseOts(otsData);
  const digest = hexToBytes(digestHex);

  if (!constantTimeEqual(digest, ots.fileDigest)) {
    throw new Error(
      `Digest mismatch!\n` +
      `  Expected (from .ots): ${bytesToHex(ots.fileDigest)}\n` +
      `  Provided:             ${digestHex}\n` +
      `  This .ots proof is for a different hash.`
    );
  }

  return walkTimestamp(ots.timestamp, ots.fileDigest, 0);
}

// ── Tree walker ────────────────────────────────────────────────────

async function walkTimestamp(
  ts: Timestamp,
  msg: Uint8Array,
  depth: number,
): Promise<VerifyResult[]> {
  if (depth > MAX_DEPTH) {
    return [{ status: 'error', message: 'Proof tree exceeds maximum depth' }];
  }

  const results: VerifyResult[] = [];

  // Check attestations at this node
  for (const att of ts.attestations) {
    results.push(await checkAttestation(att, msg));
  }

  // Follow operation branches
  for (const [op, child] of ts.ops) {
    try {
      const newMsg = await applyOperation(op, msg);
      const childResults = await walkTimestamp(child, newMsg, depth + 1);
      results.push(...childResults);
    } catch (e) {
      results.push({
        status: 'error',
        message: `Operation failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return results;
}

async function checkAttestation(att: Attestation, msg: Uint8Array): Promise<VerifyResult> {
  switch (att.type) {
    case 'bitcoin':
      return verifyBitcoin(att.height, msg);
    case 'pending':
      return { status: 'pending', uri: att.uri };
    case 'litecoin':
      return { status: 'skipped', reason: `Litecoin block #${att.height} — not verified` };
    case 'ethereum':
      return { status: 'skipped', reason: `Ethereum block #${att.height} — not verified` };
    case 'unknown':
      return { status: 'skipped', reason: `Unknown attestation type (tag: ${bytesToHex(att.tag)})` };
  }
}

async function verifyBitcoin(height: number, msg: Uint8Array): Promise<VerifyResult> {
  try {
    const blockInfo = await getBlockInfo(height);
    const expectedLe = merkleRootToLeBytes(blockInfo.merkleRoot);

    if (constantTimeEqual(msg, expectedLe)) {
      return {
        status: 'verified',
        height,
        blockHash: blockInfo.blockHash,
        blockTime: blockInfo.timestamp,
      };
    } else {
      return {
        status: 'failed',
        height,
        expected: expectedLe,
        got: new Uint8Array(msg),
      };
    }
  } catch (e) {
    return {
      status: 'error',
      message: `Could not fetch Bitcoin block #${height}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
