import { describe, it, expect } from 'vitest';
import { applyOperation, hashContents } from '../../src/core/operations.js';
import { bytesToHex } from '../../src/core/hex.js';

describe('applyOperation', () => {
  it('SHA256 of empty input', async () => {
    const result = await applyOperation({ type: 'sha256' }, new Uint8Array([]));
    expect(bytesToHex(result)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('SHA1 of empty input', async () => {
    const result = await applyOperation({ type: 'sha1' }, new Uint8Array([]));
    expect(bytesToHex(result)).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('RIPEMD160 of empty input', async () => {
    const result = await applyOperation({ type: 'ripemd160' }, new Uint8Array([]));
    expect(bytesToHex(result)).toBe('9c1185a5c5e9fc54612808977ee8f548b2258d31');
  });

  it('append', async () => {
    const result = await applyOperation(
      { type: 'append', data: new Uint8Array([0xcc, 0xdd]) },
      new Uint8Array([0xaa, 0xbb]),
    );
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });

  it('prepend', async () => {
    const result = await applyOperation(
      { type: 'prepend', data: new Uint8Array([0xcc, 0xdd]) },
      new Uint8Array([0xaa, 0xbb]),
    );
    expect(result).toEqual(new Uint8Array([0xcc, 0xdd, 0xaa, 0xbb]));
  });

  it('reverse', async () => {
    const result = await applyOperation(
      { type: 'reverse' },
      new Uint8Array([0x01, 0x02, 0x03]),
    );
    expect(result).toEqual(new Uint8Array([0x03, 0x02, 0x01]));
  });

  it('hexlify', async () => {
    const result = await applyOperation(
      { type: 'hexlify' },
      new Uint8Array([0xab, 0xcd]),
    );
    // Should produce the UTF-8 bytes for "abcd"
    expect(result).toEqual(new TextEncoder().encode('abcd'));
  });

  it('keccak256 of empty input', async () => {
    // Canonical Keccak-256 (Ethereum) empty-string digest.
    const result = await applyOperation({ type: 'keccak256' }, new Uint8Array([]));
    expect(bytesToHex(result)).toBe(
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    );
  });
});

describe('hashContents', () => {
  it('hashes "Hello World!\\n" with SHA256', async () => {
    const data = new TextEncoder().encode('Hello World!\n');
    const result = await hashContents(data, 'sha256');
    expect(bytesToHex(result)).toBe(
      '03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340'
    );
  });

  it('hashes "Hello World!\\n" with Keccak256', async () => {
    const data = new TextEncoder().encode('Hello World!\n');
    const result = await hashContents(data, 'keccak256');
    expect(bytesToHex(result)).toBe(
      'dc85a6bbfd4658040ef305c9333cf0d5a82ede2854f112549f3925df6b2c0e71'
    );
  });
});
