/**
 * Stamping logic — hash data and submit to OpenTimestamps calendar servers.
 *
 * Ported from zeitstempel's stamp.rs.
 *
 * Flow:
 *   1. SHA256-hash the data
 *   2. Generate a 16-byte random nonce (privacy protection)
 *   3. Compute calendar_digest = SHA256(nonce || file_digest)
 *   4. POST the 32-byte digest to calendar servers
 *   5. Build the .ots binary from header + operations + responses
 */

import { sha256 } from './crypto.js';
import {
  HEADER_MAGIC, TAG_PREPEND, TAG_SHA256, TAG_FORK,
  HASH_OP_TO_TAG,
} from './constants.js';
import { writeVaruint, writeVarbytes, _ByteBuffer as ByteBuffer } from './writer.js';
import { parseTimestampFromBytes } from './parser.js';
import { hexToBytes, bytesToHex } from './hex.js';

/** Calendar servers to submit to. */
const CALENDAR_SERVERS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
];

/**
 * Stamp a SHA256 hex digest and return the complete .ots proof bytes.
 *
 * This is the primary API: you pass a pre-computed SHA256 hash (as hex),
 * and get back the .ots bytes ready to save or store.
 */
export async function stampHash(sha256Hex: string): Promise<Uint8Array> {
  // Convert hex to bytes
  const fileDigest = hexToBytes(sha256Hex);

  if (fileDigest.length !== 32) {
    throw new Error(`Expected 32-byte SHA256 digest, got ${fileDigest.length} bytes`);
  }

  // Generate 16-byte random nonce for privacy
  const nonce = await getRandomBytes(16);

  // Compute calendar_digest = SHA256(nonce || fileDigest)
  const combined = new Uint8Array(nonce.length + fileDigest.length);
  combined.set(nonce);
  combined.set(fileDigest, nonce.length);
  const calendarDigest = await sha256(combined);

  // Submit to calendar servers
  const responses: { server: string; data: Uint8Array }[] = [];
  const errors: string[] = [];

  for (const server of CALENDAR_SERVERS) {
    try {
      const data = await submitToCalendar(server, calendarDigest);
      // Only embed responses that parse as a valid timestamp tree — a
      // broken or malicious calendar response would otherwise produce
      // a corrupt .ots while stamping reports success. Parsing also
      // runs the calendar-URI validation on any pending attestations
      // the server returned.
      parseTimestampFromBytes(data);
      responses.push({ server, data });
    } catch (e) {
      errors.push(`${server}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (responses.length === 0) {
    throw new Error(`No calendar server responded: ${errors.join('; ')}`);
  }

  // Build the .ots binary
  const buf = new ByteBuffer();

  // Header + version 1
  buf.extend(HEADER_MAGIC);
  writeVaruint(buf, 1);

  // Hash op (SHA256) + file digest
  buf.push(HASH_OP_TO_TAG.sha256);
  buf.extend(fileDigest);

  // Prepend(nonce) operation
  buf.push(TAG_PREPEND);
  writeVarbytes(buf, nonce);

  // SHA256 operation (produces the calendar_digest)
  buf.push(TAG_SHA256);

  // Calendar responses — if multiple, use fork markers
  if (responses.length > 1) {
    for (const { data } of responses.slice(0, -1)) {
      buf.push(TAG_FORK);
      buf.extend(data);
    }
  }
  // Last (or only) response — no fork prefix
  buf.extend(responses[responses.length - 1].data);

  return buf.toUint8Array();
}

/**
 * Stamp raw file data: SHA256-hash it first, then stamp.
 */
export async function stampFile(fileData: Uint8Array): Promise<Uint8Array> {
  const digest = await sha256(fileData);
  return stampHash(bytesToHex(digest));
}

/**
 * Cryptographically-secure random bytes.
 *
 * Prefers the Web Crypto API (browsers — including insecure http:
 * contexts — and Node 19+), falling back to node:crypto for older Node
 * runtimes that lack the `crypto` global. This mirrors the crypto.subtle
 * fallback in crypto.ts. (Note: getRandomValues is *not* gated on a
 * secure context — only crypto.subtle is.)
 */
async function getRandomBytes(n: number): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    return globalThis.crypto.getRandomValues(new Uint8Array(n));
  }
  const { randomBytes } = await import('node:crypto');
  return new Uint8Array(randomBytes(n));
}

/** Submit a 32-byte digest to a calendar server via HTTP POST. */
async function submitToCalendar(server: string, digest: Uint8Array): Promise<Uint8Array> {
  const url = `${server}/digest`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.opentimestamps.v1',
      'User-Agent': 'zeitstempel',
      'Content-Type': 'application/octet-stream',
    },
    body: digest as BodyInit,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength === 0) {
    throw new Error(`Empty response from ${url}`);
  }
  if (body.byteLength > 65536) {
    throw new Error(`Response too large from ${url}`);
  }

  return new Uint8Array(body);
}
