/**
 * Binary .ots format parser — synchronous, no crypto needed.
 *
 * Ported from zeitstempel's parser.rs (~629 lines → ~200 TS lines).
 * The parser reads the binary structure without computing any hashes.
 * Hash operations are only executed during verification.
 */

import {
  HEADER_MAGIC, TAG_TO_HASH_OP, HASH_OP_DIGEST_LEN,
  TAG_APPEND, TAG_PREPEND, TAG_REVERSE, TAG_HEXLIFY,
  TAG_SHA256, TAG_SHA1, TAG_RIPEMD160, TAG_KECCAK256,
  TAG_ATTESTATION, TAG_FORK,
  ATT_TAG_BITCOIN, ATT_TAG_LITECOIN, ATT_TAG_ETHEREUM, ATT_TAG_PENDING,
} from './constants.js';
import type { HashOp } from './constants.js';
import type { OtsFile, Timestamp, Operation, Attestation } from './types.js';
import { constantTimeEqual } from './hex.js';

// ── Error types ───────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

// ── Internal cursor ───────────────────────────────────────────────

class Cursor {
  private pos = 0;
  constructor(private data: Uint8Array) {}

  remaining(): number {
    return this.data.length - this.pos;
  }

  peek(): number {
    if (this.pos >= this.data.length) {
      throw new ParseError('Unexpected end of file');
    }
    return this.data[this.pos];
  }

  readByte(): number {
    if (this.pos >= this.data.length) {
      throw new ParseError('Unexpected end of file');
    }
    return this.data[this.pos++];
  }

  readBytes(n: number): Uint8Array {
    if (this.pos + n > this.data.length) {
      throw new ParseError('Unexpected end of file');
    }
    const slice = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  /**
   * Read an unsigned LEB128 varint.
   *
   * Each byte contributes 7 data bits; the high bit signals whether
   * more bytes follow. We must stay within Number.MAX_SAFE_INTEGER
   * (2^53 - 1) since JavaScript doesn't have u64.
   *
   * Uses `2 ** shift` instead of `<<` to handle values > 2^31
   * correctly in JavaScript (bitwise ops truncate to 32 bits).
   */
  readVaruint(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = this.readByte();
      const payload = byte & 0x7f;

      // Guard against exceeding Number.MAX_SAFE_INTEGER (2^53 - 1):
      //   shift 49: payload * 2^49 is safe for payload ≤ 15 (2^4 - 1)
      //   shift 56+: even payload=1 gives 2^56 which overflows
      if (shift >= 56 && payload > 0) {
        throw new ParseError('Varuint overflow');
      }
      if (shift >= 49 && payload > 15) {
        throw new ParseError('Varuint overflow');
      }

      value += payload * (2 ** shift);
      shift += 7;

      if ((byte & 0x80) === 0) {
        return value;
      }
    }
  }

  /** Read a length-prefixed byte string (varuint length + raw bytes). */
  readVarbytes(): Uint8Array {
    const len = this.readVaruint();
    if (len > 1_048_576) {
      throw new ParseError('Varbytes length exceeds 1 MB');
    }
    return this.readBytes(len);
  }
}

// ── Public API ─────────────────────────────────────────────────────

/** Parse an .ots file from raw bytes. */
export function parseOts(data: Uint8Array): OtsFile {
  const c = new Cursor(data);

  // 1. Validate the 31-byte magic header
  const header = c.readBytes(HEADER_MAGIC.length);
  if (!constantTimeEqual(header, HEADER_MAGIC)) {
    throw new ParseError('Not a valid .ots file (bad magic header)');
  }

  // 2. Read version (must be 1)
  const version = c.readVaruint();
  if (version !== 1) {
    throw new ParseError(`Unsupported .ots version: ${version}`);
  }

  // 3. Read the hash operation used on the original file
  const hashOp = parseHashOp(c.readByte());

  // 4. Read the file digest
  const digestLen = HASH_OP_DIGEST_LEN[hashOp];
  const fileDigest = c.readBytes(digestLen);

  // 5. Parse the recursive timestamp tree
  const timestamp = parseTimestamp(c, 0);

  return { hashOp, fileDigest, timestamp };
}

/** Parse a timestamp sub-tree from raw bytes (e.g., a calendar response). */
export function parseTimestampFromBytes(data: Uint8Array): Timestamp {
  const c = new Cursor(data);
  return parseTimestamp(c, 0);
}

// ── Internal helpers ──────────────────────────────────────────────

const MAX_DEPTH = 256;

function parseHashOp(tag: number): HashOp {
  const op = TAG_TO_HASH_OP[tag];
  if (!op) {
    throw new ParseError(`Unknown hash operation tag: 0x${tag.toString(16).padStart(2, '0')}`);
  }
  return op;
}

function parseTimestamp(c: Cursor, depth: number): Timestamp {
  if (depth > MAX_DEPTH) {
    throw new ParseError('Timestamp tree exceeds maximum depth');
  }

  const attestations: Attestation[] = [];
  const ops: [Operation, Timestamp][] = [];

  // Consume fork markers — each one spawns a sibling branch
  while (c.remaining() > 0 && c.peek() === TAG_FORK) {
    c.readByte(); // consume 0xFF
    parseTimestampBranch(c, attestations, ops, depth);
  }

  // Parse the final (non-forked) branch
  if (c.remaining() > 0) {
    parseTimestampBranch(c, attestations, ops, depth);
  }

  return { attestations, ops };
}

function parseTimestampBranch(
  c: Cursor,
  attestations: Attestation[],
  ops: [Operation, Timestamp][],
  depth: number,
): void {
  const tag = c.peek();

  if (tag === TAG_ATTESTATION) {
    c.readByte(); // consume 0x00
    attestations.push(parseAttestation(c));
  } else {
    const op = parseOperation(c);
    const child = parseTimestamp(c, depth + 1);
    ops.push([op, child]);
  }
}

function parseOperation(c: Cursor): Operation {
  const tag = c.readByte();
  switch (tag) {
    case TAG_APPEND:    return { type: 'append', data: c.readVarbytes() };
    case TAG_PREPEND:   return { type: 'prepend', data: c.readVarbytes() };
    case TAG_REVERSE:   return { type: 'reverse' };
    case TAG_HEXLIFY:   return { type: 'hexlify' };
    case TAG_SHA256:    return { type: 'sha256' };
    case TAG_SHA1:      return { type: 'sha1' };
    case TAG_RIPEMD160: return { type: 'ripemd160' };
    case TAG_KECCAK256: return { type: 'keccak256' };
    default:
      throw new ParseError(`Unknown operation tag: 0x${tag.toString(16).padStart(2, '0')}`);
  }
}

function parseAttestation(c: Cursor): Attestation {
  const tag = c.readBytes(8);
  const payload = c.readVarbytes();

  if (constantTimeEqual(tag, ATT_TAG_BITCOIN)) {
    return { type: 'bitcoin', height: varuintFromSlice(payload) };
  }
  if (constantTimeEqual(tag, ATT_TAG_LITECOIN)) {
    return { type: 'litecoin', height: varuintFromSlice(payload) };
  }
  if (constantTimeEqual(tag, ATT_TAG_ETHEREUM)) {
    return { type: 'ethereum', height: varuintFromSlice(payload) };
  }
  if (constantTimeEqual(tag, ATT_TAG_PENDING)) {
    // The payload contains a nested varbytes: varuint(uri_len) + uri_bytes.
    // We need to strip that inner length prefix to get the actual URI.
    const innerCursor = new Cursor(payload);
    const uriBytes = innerCursor.readVarbytes();
    const uri = new TextDecoder().decode(uriBytes);
    validateCalendarUri(uri);
    return { type: 'pending', uri };
  }
  return { type: 'unknown', tag: tag, payload: payload };
}

/**
 * Validate a pending-calendar URI from an .ots file.
 *
 * The URI is fully attacker-controlled (anyone who writes the .ots can
 * put any string here), and the verifier will later fetch
 * `${uri}/timestamp/${hex(digest)}` during an upgrade. Without
 * validation that becomes an SSRF + digest-exfiltration primitive: a
 * crafted .ots could point at internal services, the cloud metadata
 * endpoint, or an attacker-controlled tracker.
 *
 * We require an https origin with a registrable hostname and no path,
 * query, fragment, port, or user-info. That matches every real-world
 * OpenTimestamps calendar URI (e.g. `https://alice.btc.calendar.opentimestamps.org`).
 */
function validateCalendarUri(uri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new ParseError(`pending attestation URI is malformed: ${uri}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new ParseError(
      `pending attestation URI must use https, got "${parsed.protocol}" in ${uri}`,
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ParseError(`pending attestation URI must not contain user info: ${uri}`);
  }
  if (parsed.port !== '') {
    throw new ParseError(`pending attestation URI must not specify a port: ${uri}`);
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    throw new ParseError(`pending attestation URI must not contain a path: ${uri}`);
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new ParseError(`pending attestation URI must not contain a query or fragment: ${uri}`);
  }
  // URL.hostname returns IPv6 addresses with brackets ('[::1]'), so a
  // leading '[' is enough to catch them.
  const host = parsed.hostname.toLowerCase();
  if (host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new ParseError(`pending attestation URI must not target an IP literal: ${uri}`);
  }
  if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) {
    throw new ParseError(`pending attestation URI must be a registrable domain: ${uri}`);
  }
}

/** Read a varuint from a standalone byte slice. */
function varuintFromSlice(data: Uint8Array): number {
  const c = new Cursor(data);
  return c.readVaruint();
}

// ── Tree utilities ────────────────────────────────────────────────

/** Count total attestations in a timestamp tree. */
export function countAttestations(ts: Timestamp): number {
  let count = ts.attestations.length;
  for (const [, child] of ts.ops) {
    count += countAttestations(child);
  }
  return count;
}

/** Find the first Bitcoin attestation height in a tree. */
export function findBitcoinHeight(ts: Timestamp): number | null {
  for (const att of ts.attestations) {
    if (att.type === 'bitcoin') return att.height;
  }
  for (const [, child] of ts.ops) {
    const h = findBitcoinHeight(child);
    if (h !== null) return h;
  }
  return null;
}

/** Check if a timestamp tree has any pending attestations. */
export function hasPending(ts: Timestamp): boolean {
  for (const att of ts.attestations) {
    if (att.type === 'pending') return true;
  }
  for (const [, child] of ts.ops) {
    if (hasPending(child)) return true;
  }
  return false;
}

// ── Exported for writer roundtrip tests ───────────────────────────

export { Cursor as _Cursor };
