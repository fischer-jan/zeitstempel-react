/**
 * Core module — re-exports all public API from submodules.
 * Zero React dependency.
 */

// Types
export type {
  OtsFile,
  Timestamp,
  Operation,
  Attestation,
  VerifyResult,
  UpgradeResult,
} from './types.js';

export type { HashOp } from './constants.js';

// Hex utilities
export { bytesToHex, hexToBytes } from './hex.js';

// Crypto
export { sha256, sha1, ripemd160, keccak256 } from './crypto.js';

// Parser + Writer
export { parseOts, parseTimestampFromBytes, countAttestations, findBitcoinHeight, hasPending, ParseError } from './parser.js';
export { writeOts } from './writer.js';

// Operations
export { applyOperation, hashContents } from './operations.js';

// Verification
export { verifyFile, verifyDigest } from './verify.js';

// Bitcoin API
export { getBlockInfo, merkleRootToLeBytes } from './bitcoin.js';
export type { BlockInfo } from './bitcoin.js';

// Stamping
export { stampHash, stampFile } from './stamp.js';

// Upgrade
export { upgradeProof } from './upgrade.js';

// Info display
export { formatProofTree } from './info.js';

// Constants (for advanced usage)
export { HEADER_MAGIC, HASH_OP_DISPLAY } from './constants.js';
