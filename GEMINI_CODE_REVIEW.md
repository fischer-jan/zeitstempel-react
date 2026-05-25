# zeitstempel-react Code Review

## Executive Summary
**zeitstempel-react** is a high-quality, type-safe implementation of the OpenTimestamps (OTS) protocol, successfully porting the core logic from Rust to TypeScript. The library's architecture is clean, with a clear separation between core logic and React components. It uses idiomatic TypeScript (discriminated unions) to model the OTS domain effectively. The most significant weaknesses are the major gaps in test coverage for critical paths (verification, upgrading, stamping) and the use of non-constant-time comparisons for cryptographic hashes. While the code is well-structured and follows most best practices, these gaps must be addressed before a production release.

## Critical Issues

### 1. Major Test Coverage Gaps
- **Files**: `src/core/verify.ts`, `src/core/stamp.ts`, `src/core/upgrade.ts`
- **Description**: These core files have zero test coverage in the current test suite. For a cryptographic verification library, leaving the verification, stamping, and upgrading logic untested is a critical risk.
- **Suggested Fix**: Add comprehensive unit tests for these modules, including tests for valid proofs, invalid digests, pending attestations, and edge cases in the tree-walking logic.

### 2. Non-Constant-Time Hash Comparison
- **File**: `src/core/verify.ts` (line 125), `src/core/parser.ts` (line 182)
- **Problematic Code**:
  ```typescript
  function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  ```
- **Why it's a problem**: This function returns as soon as a mismatch is found, making it susceptible to timing attacks. While the hashes being compared (merkle roots, file digests) are often public, it is a security best practice in cryptographic libraries to use constant-time comparisons for all security-critical data.
- **Suggested Fix**: Implement a constant-time comparison function:
  ```typescript
  function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }
  ```

### 3. Brittle Hex Parsing in Stamping Logic
- **File**: `src/core/stamp.ts` (line 35)
- **Problematic Code**:
  ```typescript
  const fileDigest = new Uint8Array(
    sha256Hex.match(/.{2}/g)!.map(b => parseInt(b, 16))
  );
  ```
- **Why it's a problem**: This regex-based approach will crash if `sha256Hex` is not a valid hex string or has an odd length (returning `null` and failing at the `!`). It also duplicates logic already present in `hex.ts`.
- **Suggested Fix**: Use the existing `hexToBytes` utility from `src/core/hex.ts`, which includes proper error handling.

## Important Issues

### 1. Manual OTS Building in `stamp.ts`
- **File**: `src/core/stamp.ts` (lines 66-93)
- **Description**: The `stampHash` function manually constructs the binary `.ots` file structure instead of using the `writeOts` function from `writer.ts`. This leads to code duplication and increases the risk of the writer and stamper becoming out of sync with the specification.
- **Suggested Fix**: Refactor `stampHash` to construct an `OtsFile` object and then use `writeOts(otsFile)` to generate the binary output.

### 2. In-place Mutation during Upgrade
- **File**: `src/core/upgrade.ts` (lines 75-76)
- **Problematic Code**:
  ```typescript
  ts.attestations = newAttestations;
  ts.ops.push(...newOps);
  ```
- **Why it's a problem**: The `upgradeTimestamp` function modifies the `Timestamp` tree in-place while also recursing into it. While functional, this mutation makes the logic harder to reason about and could lead to issues if multiple upgrade attempts happen concurrently on the same object.
- **Suggested Fix**: Consider a more functional approach where `upgradeTimestamp` returns a new `Timestamp` object, or at least be more explicit about the mutation boundaries.

### 3. Potential Varuint Precision Overflow Check
- **File**: `src/core/parser.ts` (line 72)
- **Problematic Code**:
  ```typescript
  if (shift >= 49 && payload > 1) {
    throw new ParseError('Varuint overflow');
  }
  ```
- **Why it's a problem**: JavaScript's `Number.MAX_SAFE_INTEGER` is $2^{53}-1$. At `shift === 49`, the remaining bits available are $53 - 49 = 4$. So `payload` can safely be up to $2^4 - 1 = 15$. The current check `payload > 1` is overly restrictive, though likely safe for most OTS files.
- **Suggested Fix**: Update the check to `if (shift >= 49 && payload > 15)`.

## Minor Issues

### 1. Missing `keccak256` Support
- **File**: `src/core/operations.ts` (line 41)
- **Description**: The library recognizes the `keccak256` tag in the parser but throws an error during execution. While rare in current OTS usage, it's part of the spec.
- **Suggested Fix**: Either implement it (using `@noble/hashes`) or clearly document that it's intentionally omitted for v0.1.0.

### 2. No Rate Limiting/Caching for Bitcoin API
- **File**: `src/core/bitcoin.ts`
- **Description**: `getBlockInfo` makes network requests to public APIs without any caching or rate-limiting logic. Users of the React components might inadvertently trigger rate limits if many timestamps are verified at once.
- **Suggested Fix**: Add a simple in-memory cache for block lookups.

### 3. Roundtrip Test Weakness
- **File**: `tests/unit/writer.test.ts`
- **Description**: The roundtrip test checks if a re-parsed file has the same metadata, but it doesn't verify that the `writeOts` output is byte-identical to the original fixture data.
- **Suggested Fix**: Add an assertion: `expect(serialized).toEqual(data)`.

## Architecture Assessment
The architecture is well-thought-out. The decision to use synchronous parsing (`parser.ts`) while keeping execution/verification async (`operations.ts`, `verify.ts`) is correct because only the latter requires crypto and network. The module boundaries are clean, and the library is well-positioned for tree-shaking. The React component API is flexible and avoids bloating the core library with UI dependencies.

## Security Assessment
- **Web Crypto API**: Proper usage of `crypto.subtle` for hardware-accelerated hashing.
- **Entropy**: Correct use of `crypto.getRandomValues()` for the 16-byte privacy nonce in `stamp.ts`.
- **Parsing Limits**: Good use of `MAX_DEPTH` (256) and `MAX_VARBYTES` (1MB) to prevent resource exhaustion attacks from malformed `.ots` files.
- **Trust Model**: The library correctly delegates trust to public block explorers for Bitcoin verification, which is appropriate for a client-side library.

## Testing Assessment
The existing unit tests for the parser and writer are high quality but incomplete. The `hello-world.txt.ots` fixture is a good start, but more fixtures are needed to cover:
- Pending proofs (returned from `stamp.ts`).
- Proofs with multiple attestations.
- Proofs using different hash algorithms (SHA1, RIPEMD160).
- Malformed proofs (to test error boundaries).

## Build & Distribution Assessment
The `package.json` configuration is excellent. It correctly handles Dual ESM/CJS distribution and includes type definitions. The `peerDependencies` are correctly set for React 18/19 compatibility.

## Positive Observations
- **Zero-Dependency Core**: Only one dependency (`@noble/hashes`) is used, and only for RIPEMD160 which is missing from Web Crypto.
- **No `any`**: The codebase is strictly typed, which is rare and commendable for a v0.1.0 project.
- **ASCII Art**: The `info.ts` implementation for tree display is clear and well-ported.
- **Fallbacks**: Good fallback logic in `bitcoin.ts` (trying multiple explorers).

## Recommended Next Steps
1. **Critical**: Implement unit tests for `verify.ts`, `stamp.ts`, and `upgrade.ts`.
2. **Critical**: Replace `arraysEqual` with a constant-time comparison in `verify.ts`.
3. **Important**: Add a `README.md` with usage examples and security considerations.
4. **Important**: Refactor `stamp.ts` to use `writeOts` instead of manual binary construction.
5. **Minor**: Add a simple cache for Bitcoin block lookups to improve DX and avoid rate limits.
