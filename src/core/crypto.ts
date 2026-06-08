/**
 * Cryptographic hash abstractions.
 *
 * SHA256 and SHA1 use the native crypto.subtle API (hardware-accelerated
 * in browsers, available in Node 18+). RIPEMD160 uses @noble/hashes
 * because crypto.subtle doesn't support it.
 */

import { ripemd160 as nobleRipemd160 } from '@noble/hashes/ripemd160';
import { keccak_256 as nobleKeccak256 } from '@noble/hashes/sha3';

/** SHA256 hash using native crypto. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
    return new Uint8Array(hash);
  }
  // Node.js fallback for environments without crypto.subtle
  const { createHash } = await import('node:crypto');
  return new Uint8Array(createHash('sha256').update(data).digest());
}

/** SHA1 hash using native crypto. */
export async function sha1(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const hash = await globalThis.crypto.subtle.digest('SHA-1', data as BufferSource);
    return new Uint8Array(hash);
  }
  const { createHash } = await import('node:crypto');
  return new Uint8Array(createHash('sha1').update(data).digest());
}

/** RIPEMD160 hash using @noble/hashes (synchronous). */
export function ripemd160(data: Uint8Array): Uint8Array {
  return nobleRipemd160(data);
}

/**
 * Keccak-256 hash using @noble/hashes (synchronous).
 *
 * This is the original Keccak (NIST submission) padding, as used by
 * Ethereum — NOT the later SHA3-256 standard. OpenTimestamps proofs
 * built over Ethereum/keccak chains use this variant.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return nobleKeccak256(data);
}
