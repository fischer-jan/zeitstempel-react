import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseOts, countAttestations, findBitcoinHeight, hasPending, _Cursor as Cursor } from '../../src/core/parser.js';
import { writeOts } from '../../src/core/writer.js';
import { bytesToHex } from '../../src/core/hex.js';
import type { Timestamp, OtsFile } from '../../src/core/types.js';

const FIXTURE_DIR = resolve(__dirname, '../fixtures');

describe('Cursor.readVaruint', () => {
  it('reads single-byte values', () => {
    const c = new Cursor(new Uint8Array([0x00]));
    expect(c.readVaruint()).toBe(0);
  });

  it('reads 1', () => {
    const c = new Cursor(new Uint8Array([0x01]));
    expect(c.readVaruint()).toBe(1);
  });

  it('reads 127', () => {
    const c = new Cursor(new Uint8Array([0x7f]));
    expect(c.readVaruint()).toBe(127);
  });

  it('reads 128 (multi-byte)', () => {
    // 128 = [0x80, 0x01]
    const c = new Cursor(new Uint8Array([0x80, 0x01]));
    expect(c.readVaruint()).toBe(128);
  });

  it('reads 300 (multi-byte)', () => {
    // 300 = [0xAC, 0x02]
    const c = new Cursor(new Uint8Array([0xac, 0x02]));
    expect(c.readVaruint()).toBe(300);
  });

  it('reads a large safe value (8 bytes, shift=49 with payload ≤ 15)', () => {
    // Encode a value that uses 8 LEB128 bytes and stays within safe integer range.
    // 8 bytes: 7 continuation bytes + 1 final byte.
    // All 0x80 for first 7 bytes (payload=0), final byte 0x0f (payload=15).
    // Value = 15 * 2^49 = 8444249301319680
    const bytes = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x0f]);
    const c = new Cursor(bytes);
    expect(c.readVaruint()).toBe(15 * (2 ** 49));
  });

  it('rejects overflow at shift=49 with payload > 15', () => {
    // Same as above but final byte 0x10 (payload=16) → would exceed 2^53
    const bytes = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10]);
    const c = new Cursor(bytes);
    expect(() => c.readVaruint()).toThrow('Varuint overflow');
  });

  it('rejects overflow at shift=56', () => {
    // 9 bytes: 8 continuation bytes + final byte with payload=1
    // Would be 1 * 2^56 which exceeds Number.MAX_SAFE_INTEGER
    const bytes = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]);
    const c = new Cursor(bytes);
    expect(() => c.readVaruint()).toThrow('Varuint overflow');
  });
});

describe('Cursor.readVarbytes', () => {
  it('reads length-prefixed bytes', () => {
    const c = new Cursor(new Uint8Array([0x03, 0xaa, 0xbb, 0xcc]));
    expect(c.readVarbytes()).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]));
  });

  it('reads empty varbytes', () => {
    const c = new Cursor(new Uint8Array([0x00]));
    expect(c.readVarbytes()).toEqual(new Uint8Array([]));
  });
});

describe('parseOts', () => {
  it('rejects too-short data', () => {
    expect(() => parseOts(new Uint8Array([0x00, 0x01, 0x02]))).toThrow('Unexpected end of file');
  });

  it('rejects wrong magic header', () => {
    const data = new Uint8Array(31).fill(0x42);
    expect(() => parseOts(data)).toThrow('bad magic header');
  });

  it('parses hello-world.txt.ots fixture', () => {
    const data = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, 'hello-world.txt.ots')));
    const ots = parseOts(data);

    // Should be SHA256
    expect(ots.hashOp).toBe('sha256');

    // Digest should be 32 bytes
    expect(ots.fileDigest.length).toBe(32);

    // Known digest of "Hello World!\n"
    expect(bytesToHex(ots.fileDigest)).toBe(
      '03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340'
    );

    // Should have exactly 1 attestation (Bitcoin)
    expect(countAttestations(ots.timestamp)).toBe(1);

    // Bitcoin block #358391
    expect(findBitcoinHeight(ots.timestamp)).toBe(358391);
  });

  // ── Calendar-URI validation ────────────────────────────────────
  //
  // The pending URI is fully attacker-controlled. parseOts must
  // reject anything that isn't an https origin with a registrable
  // hostname — otherwise upgrade becomes an SSRF + digest-exfil
  // primitive.

  function otsWithPendingUri(uri: string): Uint8Array {
    const ots: OtsFile = {
      hashOp: 'sha256',
      fileDigest: new Uint8Array(32),
      timestamp: {
        attestations: [{ type: 'pending', uri }],
        ops: [],
      },
    };
    return writeOts(ots);
  }

  it('accepts a normal opentimestamps.org calendar URI', () => {
    const bytes = otsWithPendingUri('https://alice.btc.calendar.opentimestamps.org');
    expect(() => parseOts(bytes)).not.toThrow();
  });

  it.each([
    ['http (no TLS)', 'http://alice.btc.calendar.opentimestamps.org'],
    ['file URL', 'file:///etc/passwd'],
    ['IPv4 literal', 'https://127.0.0.1'],
    ['cloud metadata IP', 'https://169.254.169.254'],
    ['IPv6 literal', 'https://[::1]'],
    ['localhost', 'https://localhost'],
    ['bare hostname', 'https://intranet'],
    ['path component', 'https://attacker.example/exfil'],
    ['query string', 'https://attacker.example?x=1'],
    ['fragment', 'https://attacker.example#frag'],
    ['port', 'https://attacker.example:8080'],
    ['user info', 'https://user:pw@attacker.example'],
  ])('rejects a pending URI with %s', (_label, uri) => {
    const bytes = otsWithPendingUri(uri);
    expect(() => parseOts(bytes)).toThrow();
  });

  it('parses golden pending fixture (from reference Python ots tool)', () => {
    const data = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, 'golden-pending.txt.ots')));
    const ots = parseOts(data);

    expect(ots.hashOp).toBe('sha256');
    expect(ots.fileDigest.length).toBe(32);

    // Should have pending attestations
    expect(hasPending(ots.timestamp)).toBe(true);

    // Collect all pending URIs from the tree
    const pendingUris: string[] = [];
    function collectPending(ts: Timestamp) {
      for (const att of ts.attestations) {
        if (att.type === 'pending') pendingUris.push(att.uri);
      }
      for (const [, child] of ts.ops) collectPending(child);
    }
    collectPending(ots.timestamp);

    // The reference tool submitted to 4 calendar servers
    expect(pendingUris.length).toBeGreaterThanOrEqual(2);

    // Every URI must be a valid https URL — no stray prefix bytes
    for (const uri of pendingUris) {
      expect(uri).toMatch(/^https:\/\//);
      expect(uri).not.toMatch(/^[^h]/); // no +, -, or other prefix
    }
  });
});
