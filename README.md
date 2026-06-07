# zeitstempel

[![npm version](https://img.shields.io/npm/v/zeitstempel.svg)](https://www.npmjs.com/package/zeitstempel)

A lightweight TypeScript library for the full [OpenTimestamps](https://opentimestamps.org/) lifecycle: **stamp**, **upgrade**, and **verify** -- with optional React components. Works in browsers and Node.js.

*Zeitstempel* is German for "timestamp". This is the TypeScript sibling of [zeitstempel](https://github.com/xfaSts9cwY6VqLNTMAtR/zeitstempel), a Rust CLI for the same purpose.

## What it does

OpenTimestamps lets you prove that data existed at a certain point in time by anchoring a hash to the Bitcoin blockchain. This library handles the entire workflow:

1. **Stamp** -- hash your data and submit it to OpenTimestamps calendar servers
2. **Upgrade** -- once Bitcoin confirms (1-3 blocks, typically 30 min to 3 hours), fetch the completed proof chain
3. **Verify** -- replay the proof's hash operations and check the result against a real Bitcoin block header

The entire core is about 1,300 lines of TypeScript -- significantly smaller than the reference [python-opentimestamps](https://github.com/opentimestamps/python-opentimestamps) implementation. The binary `.ots` format parser, serializer, tree walker, and operation replay engine are all written from scratch. The only runtime dependency is `@noble/hashes` for cryptographic hash functions.

## A note on privacy

OpenTimestamps anchors a *hash* to the Bitcoin blockchain -- not the data itself. The 32-byte digest is the only thing that ever needs to leave your machine.

In my view this is a real issue with the standard implementation at [opentimestamps.org](https://opentimestamps.org/): the web tool asks you to hand over the file itself. Even if the page happens to hash client-side today, the design trains users to drop sensitive files into a "verification tool" -- and a compromised page or a malicious mirror could exfiltrate them without the user noticing. For anything you wouldn't want a stranger to read, that's a hard no.

## Install

```bash
npm install zeitstempel
```

## Core API

Import from `zeitstempel` (no React dependency required):

```typescript
import {
  stampFile,
  stampHash,
  upgradeProof,
  verifyFile,
  verifyDigest,
  parseOts,
  writeOts,
  formatProofTree,
} from 'zeitstempel';
```

### Stamp a file

```typescript
// From raw file data
const fileData = new Uint8Array(await file.arrayBuffer());
const otsBytes = await stampFile(fileData);
// Save otsBytes as a .ots file

// Or from a pre-computed SHA256 hex digest
const otsBytes = await stampHash('abcd1234...');
```

### Upgrade a pending proof

After stamping, the proof is pending until Bitcoin confirms it. Call `upgradeProof` later to complete it:

```typescript
const ots = parseOts(otsBytes);
const result = await upgradeProof(ots);

console.log(result.upgraded);      // number of attestations upgraded
console.log(result.stillPending);  // number still waiting for Bitcoin
console.log(result.alreadyComplete); // true if nothing to upgrade

if (result.upgraded > 0) {
  const upgradedBytes = writeOts(ots); // save the upgraded proof
}
```

### Verify a file

```typescript
const results = await verifyFile(fileData, otsBytes);

for (const r of results) {
  if (r.status === 'verified') {
    console.log(`Verified at Bitcoin block #${r.height}`);
    console.log(`Block time: ${new Date(r.blockTime * 1000)}`);
  } else if (r.status === 'pending') {
    console.log(`Pending: ${r.uri}`);
  }
}

// Or verify against a pre-computed digest (no original file needed)
const results = await verifyDigest('abcd1234...', otsBytes);
```

### Inspect a proof

```typescript
const ots = parseOts(otsBytes);
console.log(formatProofTree(ots));
```

```
File hash: 7e0b2290f512...5232 (SHA256)
|
+-- append(d19c5f3dbf07...)
    +-- SHA256
        +-- append(0728...)
        |   +-- SHA256
        |       +-- ...
        |           +-- Bitcoin block #935777
        +-- append(6da7...)
            +-- SHA256
                +-- ...
                    +-- Pending (https://bob.btc.calendar.opentimestamps.org)
```

## React Components

Import from `zeitstempel/react` (requires React 18+):

```typescript
import {
  VerifyTimestampButton,
  TimestampStatus,
  TimestampDownloadLinks,
} from 'zeitstempel/react';
```

### VerifyTimestampButton

A button that calls an async verification function and shows the result with visual feedback:

```tsx
<VerifyTimestampButton
  onVerify={() => verifyFile(fileData, otsBytes)}
  showLabel
/>
```

### TimestampStatus

A lightweight status badge for displaying verification state in lists or tables:

```tsx
<TimestampStatus state="verified" result={verifyResult} />
```

### TimestampDownloadLinks

Download links for hash files and `.ots` proofs, plus a link to opentimestamps.org for external verification:

```tsx
<TimestampDownloadLinks
  timestamp={{
    contentHash: 'abcd1234...',
    otsProof: btoa(String.fromCharCode(...otsBytes)),
  }}
/>
```

All components are unstyled by default -- use `className` props to apply your own styles.

## Testing

```bash
# Unit tests (fast, no network)
npm test

# Integration test -- stamps a real file via calendar servers
OTS_WAIT=0 npx vitest run tests/integration/lifecycle.test.ts

# Integration test with full wait for Bitcoin confirmation (~3 hours)
OTS_WAIT=1 npx vitest run tests/integration/lifecycle.test.ts

# Interactive mode -- prompts whether to wait
npx vitest run tests/integration/lifecycle.test.ts
```

Unit tests include golden fixtures created by the reference Python `ots` tool, ensuring parser and writer correctness against the canonical implementation.

## Architecture

```
src/
  core/
    stamp.ts       Submit file hashes to calendar servers, build .ots proofs
    upgrade.ts     Fetch completed proofs from calendar servers
    verify.ts      Replay hash operations, check against Bitcoin blocks
    parser.ts      Binary .ots format parser (LEB128 varints, tree walking)
    writer.ts      Binary .ots format serializer (inverse of parser)
    operations.ts  Hash/append/prepend/reverse operation executors
    bitcoin.ts     Blockstream.info API client (mempool.space fallback)
    crypto.ts      SHA256, SHA1, RIPEMD160 via @noble/hashes
    info.ts        ASCII art proof tree renderer
    hex.ts         Hex encoding/decoding utilities
    types.ts       TypeScript types (OtsFile, Timestamp, Attestation, etc.)
    constants.ts   OTS binary format constants and tags
  react/
    VerifyTimestampButton.tsx   Verification button with status feedback
    TimestampStatus.tsx         Lightweight status badge
    TimestampDownloadLinks.tsx  Download links for external verification
```

### What's written from scratch
- Binary `.ots` format parser and serializer
- LEB128 varuint encoder/decoder
- Timestamp tree walker (for verify, upgrade, and info)
- Attestation parser (Bitcoin, Litecoin, Ethereum, Pending)
- Operation replay engine
- Calendar server interaction (stamp + upgrade)
- ASCII art proof tree renderer

### Dependencies
- `@noble/hashes` -- cryptographic hash functions (SHA256, SHA1, RIPEMD160)
- React 18+ -- optional peer dependency, only needed for the React components

## Supported features

- Stamp files via OpenTimestamps calendar servers (Alice + Bob)
- Upgrade pending proofs to Bitcoin-anchored
- Bitcoin attestation verification against public block explorers
- Litecoin/Ethereum attestations are recognized and displayed, but not verified
- SHA256, SHA1, RIPEMD160, Keccak256 hash operations
- Append, prepend, reverse, hexlify operations
- Proof tree forks (multiple attestation paths)
- API fallback: Blockstream.info -> mempool.space
- Parse, serialize, and inspect `.ots` proofs

## See also

**[zeitstempel](https://github.com/xfaSts9cwY6VqLNTMAtR/zeitstempel)** -- the Rust CLI version. Same stamp/upgrade/verify lifecycle, compiles to a single portable binary. Use it if you want a command-line tool rather than a library.

## License

MIT
