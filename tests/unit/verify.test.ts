import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyFile, verifyDigest } from '../../src/core/verify.js';
import { parseOts } from '../../src/core/parser.js';
import { writeOts } from '../../src/core/writer.js';
import { applyOperation, hashContents } from '../../src/core/operations.js';
import { bytesToHex, hexToBytes } from '../../src/core/hex.js';
import type { Timestamp } from '../../src/core/types.js';

const FIXTURE_DIR = resolve(__dirname, '../fixtures');
const otsData = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, 'hello-world.txt.ots')));
const fileData = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, 'hello-world.txt')));

/**
 * Walk the proof tree, applying operations, to find the hash that
 * arrives at the first Bitcoin attestation. This is the value that
 * verification compares against the blockchain's merkle root.
 */
async function computeProofResult(ts: Timestamp, msg: Uint8Array): Promise<Uint8Array | null> {
  for (const att of ts.attestations) {
    if (att.type === 'bitcoin') return msg;
  }
  for (const [op, child] of ts.ops) {
    const newMsg = await applyOperation(op, msg);
    const result = await computeProofResult(child, newMsg);
    if (result) return result;
  }
  return null;
}

// Pre-compute the values we need for mocking the Bitcoin API.
let correctMerkleRootHex: string;
let correctDigestHex: string;

beforeAll(async () => {
  const ots = parseOts(otsData);
  const fileDigest = await hashContents(fileData, ots.hashOp);
  correctDigestHex = bytesToHex(fileDigest);

  // Run the proof chain to find what merkle root the verification expects.
  const proofResult = await computeProofResult(ots.timestamp, fileDigest);
  // Proof chain produces little-endian bytes; the API returns big-endian hex.
  const beBytes = new Uint8Array(proofResult!);
  beBytes.reverse();
  correctMerkleRootHex = bytesToHex(beBytes);
});

/**
 * Mock fetch to simulate the Bitcoin block API.
 * getBlockInfoFrom makes two sequential calls:
 *   1. GET /block-height/{height} → block hash as text
 *   2. GET /block/{hash} → JSON with merkle_root and timestamp
 */
function mockBlockApi(merkleRoot: string) {
  const blockHash = 'a'.repeat(64);
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(blockHash) })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ merkle_root: merkleRoot, timestamp: 1433919547 }),
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyFile', () => {
  it('returns verified when proof chain matches the blockchain', async () => {
    vi.stubGlobal('fetch', mockBlockApi(correctMerkleRootHex));

    const results = await verifyFile(fileData, otsData);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: 'verified',
      height: 358391,
    });
    if (results[0].status === 'verified') {
      expect(results[0].blockHash).toBe('a'.repeat(64));
      expect(results[0].blockTime).toBe(1433919547);
    }
  });

  it('throws on file digest mismatch', async () => {
    const wrongFile = new TextEncoder().encode('This is not the file you are looking for');
    await expect(verifyFile(wrongFile, otsData)).rejects.toThrow('File digest mismatch');
  });

  it('returns failed when merkle root does not match', async () => {
    vi.stubGlobal('fetch', mockBlockApi('b'.repeat(64)));

    const results = await verifyFile(fileData, otsData);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    if (results[0].status === 'failed') {
      expect(results[0].height).toBe(358391);
    }
  });

  it('returns error when bitcoin API is unreachable', async () => {
    // Both servers fail (blockstream then mempool), so all fetch calls reject.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const results = await verifyFile(fileData, otsData);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    if (results[0].status === 'error') {
      expect(results[0].message).toContain('Could not fetch Bitcoin block');
    }
  });
});

describe('verifyDigest', () => {
  it('returns verified for correct pre-computed digest', async () => {
    vi.stubGlobal('fetch', mockBlockApi(correctMerkleRootHex));

    const results = await verifyDigest(correctDigestHex, otsData);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('verified');
  });

  it('throws when digest does not match the .ots file', async () => {
    const wrongDigest = 'ff'.repeat(32);
    await expect(verifyDigest(wrongDigest, otsData)).rejects.toThrow('Digest mismatch');
  });

  it('errors on a hexlify bomb instead of exhausting memory', async () => {
    // 60 chained hexlify ops double the message 60 times — without the
    // message-size cap this tries to allocate exabytes. The leaf is a
    // Pending attestation, so no network is touched.
    function nest(depth: number): Timestamp {
      if (depth === 0) {
        return {
          attestations: [
            { type: 'pending', uri: 'https://alice.btc.calendar.opentimestamps.org' },
          ],
          ops: [],
        };
      }
      return { attestations: [], ops: [[{ type: 'hexlify' }, nest(depth - 1)]] };
    }

    const digestHex = 'aa'.repeat(32);
    const bomb = writeOts({
      hashOp: 'sha256',
      fileDigest: hexToBytes(digestHex),
      timestamp: nest(60),
    });

    const results = await verifyDigest(digestHex, bomb);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    if (results[0].status === 'error') {
      expect(results[0].message).toContain('refusing to continue');
    }
  });
});
