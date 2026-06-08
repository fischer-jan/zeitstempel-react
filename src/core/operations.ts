/**
 * Operation executors — apply proof-chain operations to a message.
 *
 * Ported from zeitstempel's operations.rs (~134 lines → ~80 TS lines).
 * Each operation transforms a Uint8Array (the "message") as it walks
 * down the proof tree. All functions are async because SHA256/SHA1
 * use crypto.subtle which returns Promises.
 */

import { sha256, sha1, ripemd160, keccak256 } from './crypto.js';
import { bytesToHex } from './hex.js';
import type { HashOp } from './constants.js';
import type { Operation } from './types.js';

/** Apply a single operation to a message, returning the new message. */
export async function applyOperation(op: Operation, msg: Uint8Array): Promise<Uint8Array> {
  switch (op.type) {
    case 'append': {
      const out = new Uint8Array(msg.length + op.data.length);
      out.set(msg);
      out.set(op.data, msg.length);
      return out;
    }
    case 'prepend': {
      const out = new Uint8Array(op.data.length + msg.length);
      out.set(op.data);
      out.set(msg, op.data.length);
      return out;
    }
    case 'sha256':
      return sha256(msg);
    case 'sha1':
      return sha1(msg);
    case 'ripemd160':
      return ripemd160(msg);
    case 'keccak256':
      return keccak256(msg);
    case 'reverse': {
      const out = new Uint8Array(msg);
      out.reverse();
      return out;
    }
    case 'hexlify':
      return new TextEncoder().encode(bytesToHex(msg));
  }
}

/** Hash data using the algorithm specified in the OTS header. */
export async function hashContents(data: Uint8Array, hashOp: HashOp): Promise<Uint8Array> {
  switch (hashOp) {
    case 'sha256':    return sha256(data);
    case 'sha1':      return sha1(data);
    case 'ripemd160': return ripemd160(data);
    case 'keccak256': return keccak256(data);
  }
}
