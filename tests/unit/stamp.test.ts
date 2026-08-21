import { describe, it, expect, vi, afterEach } from 'vitest';
import { stampHash, stampFile } from '../../src/core/stamp.js';
import { parseOts, hasPending } from '../../src/core/parser.js';
import { sha256 } from '../../src/core/crypto.js';
import { bytesToHex } from '../../src/core/hex.js';
import { _ByteBuffer as ByteBuffer, writeVarbytes } from '../../src/core/writer.js';
import { TAG_ATTESTATION, ATT_TAG_PENDING } from '../../src/core/constants.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a minimal pending-attestation response (simulates a calendar server). */
function makePendingResponse(uri: string): Uint8Array {
  const buf = new ByteBuffer();
  buf.push(TAG_ATTESTATION);
  buf.extend(ATT_TAG_PENDING);
  // The pending payload has a nested varbytes: outer(inner(uri_bytes))
  const innerPayload = new ByteBuffer();
  writeVarbytes(innerPayload, new TextEncoder().encode(uri));
  writeVarbytes(buf, innerPayload.toUint8Array());
  return buf.toUint8Array();
}

function mockCalendarServer(responseBytes: Uint8Array) {
  return vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(responseBytes.buffer),
  });
}

describe('stampHash', () => {
  it('produces a parseable OTS file with pending attestations', async () => {
    const response = makePendingResponse('https://alice.btc.calendar.opentimestamps.org');
    vi.stubGlobal('fetch', mockCalendarServer(response));

    const digest = 'aa'.repeat(32);
    const otsBytes = await stampHash(digest);

    const ots = parseOts(otsBytes);
    expect(ots.hashOp).toBe('sha256');
    expect(bytesToHex(ots.fileDigest)).toBe(digest);
    expect(hasPending(ots.timestamp)).toBe(true);
  });

  it('submits to multiple calendar servers (fork markers)', async () => {
    const response = makePendingResponse('https://calendar.example.com');
    // mockResolvedValue (not Once) → both alice and bob succeed
    vi.stubGlobal('fetch', mockCalendarServer(response));

    const otsBytes = await stampHash('bb'.repeat(32));
    const ots = parseOts(otsBytes);

    // Two successful servers → two pending attestations joined by a fork
    let pendingCount = 0;
    function countPending(ts: import('../../src/core/types.js').Timestamp) {
      for (const att of ts.attestations) {
        if (att.type === 'pending') pendingCount++;
      }
      for (const [, child] of ts.ops) countPending(child);
    }
    countPending(ots.timestamp);
    expect(pendingCount).toBe(2);
  });

  it('throws on invalid hex input', async () => {
    await expect(stampHash('not-hex')).rejects.toThrow();
  });

  it('throws on wrong-length digest', async () => {
    await expect(stampHash('aabb')).rejects.toThrow('Expected 32-byte SHA256 digest');
  });

  it('rejects a calendar response that is not a valid timestamp tree', async () => {
    // A broken or malicious calendar returning garbage must not end up
    // embedded in the .ots — stamping fails instead of writing a
    // corrupt proof.
    const garbage = new TextEncoder().encode('this is not a timestamp tree');
    vi.stubGlobal('fetch', mockCalendarServer(garbage));

    await expect(stampHash('aa'.repeat(32))).rejects.toThrow('No calendar server responded');
  });

  it('throws when no calendar server responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    await expect(stampHash('aa'.repeat(32))).rejects.toThrow('No calendar server responded');
  });
});

describe('stampFile', () => {
  it('hashes the file data then stamps it', async () => {
    const response = makePendingResponse('https://alice.btc.calendar.opentimestamps.org');
    vi.stubGlobal('fetch', mockCalendarServer(response));

    const fileData = new TextEncoder().encode('Hello World!\n');
    const otsBytes = await stampFile(fileData);

    const ots = parseOts(otsBytes);
    expect(ots.hashOp).toBe('sha256');

    // The stored digest should be SHA256 of the file content
    const expectedDigest = await sha256(fileData);
    expect(ots.fileDigest).toEqual(expectedDigest);
  });
});
