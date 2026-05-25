# Code Review Instructions for zeitstempel-react

You are reviewing **zeitstempel-react**, a TypeScript library that implements the OpenTimestamps (OTS) protocol for creating and verifying cryptographic timestamps anchored to the Bitcoin blockchain. It includes an optional set of React UI components.

## Your Task

Perform a thorough, critical code review of this entire project. Be specific: cite file names, line numbers, and code snippets. Don't just say "looks good" — find real issues, edge cases, and improvement opportunities. Be honest even when the code is solid; note strengths as well as weaknesses.

## Project Context

- **Origin**: Ported from the Rust `zeitstempel` library to TypeScript.
- **Audience**: JavaScript/TypeScript developers who need to stamp, verify, upgrade, or inspect `.ots` proof files. React developers who want ready-made UI components.
- **Maturity**: v0.1.0 (pre-release). Not yet published to npm.
- **Single production dependency**: `@noble/hashes` (for RIPEMD160 only).

## What to Review

### 1. Architecture & Design

- Is the module boundary between `src/core/` and `src/react/` clean? Does core truly have zero React dependency?
- Are the separate entry points (`index.ts`, `react/index.ts`) well-structured for tree-shaking and conditional imports?
- Does the type system (`types.ts`) model the OTS domain accurately? Are the discriminated unions for `Operation` and `Attestation` sound?
- Is the parser/writer symmetry correct and maintainable? Could roundtrip guarantees be enforced more strongly?
- How well does the code separate concerns (parsing, crypto, network, verification logic)?
- Is the React component API well-designed? Are the components composable, accessible, and following React best practices?

### 2. Code Quality & TypeScript Usage

- Are there any `any` types, unsafe casts, or places where stricter typing would catch bugs?
- Is error handling consistent? Are thrown errors informative enough for consumers?
- Are there dead code paths, unused imports, or unreachable branches?
- Is naming clear and consistent throughout (functions, variables, types, files)?
- Are there any code smells: overly long functions, deeply nested logic, duplicated code?
- Is the async/await usage correct throughout? Any missing `await`s or unhandled promise rejections?

### 3. Correctness & Edge Cases

- **Parser** (`parser.ts`): Does the varuint decoder handle all LEB128 edge cases (max value, zero, overflow)? Is the recursion depth limit (256) appropriate? Could a malformed `.ots` file cause unexpected behavior beyond a thrown error?
- **Writer** (`writer.ts`): Does the writer produce byte-identical output for a parsed-then-rewritten file? Are there edge cases where information is lost?
- **Operations** (`operations.ts`): Are all OTS operations implemented? Is the `keccak256` rejection correct per the OTS spec?
- **Verify** (`verify.ts`): Is the merkle root comparison correct (endianness!)? Could a valid timestamp ever be rejected, or an invalid one accepted?
- **Stamp** (`stamp.ts`): Is the privacy nonce implementation correct? Is 16 bytes sufficient entropy?
- **Upgrade** (`upgrade.ts`): Does the tree-replacement logic correctly handle all attestation positions (leaves, branches, multiple attestations)?
- **Info** (`info.ts`): Are there tree structures that would produce garbled or misleading ASCII output?
- **Hex** (`hex.ts`): Does hex decoding handle uppercase, mixed case, odd-length strings, and non-hex characters robustly?

### 4. Security

This is a **cryptographic verification library** — security matters a lot. Please scrutinize:

- **Crypto primitives** (`crypto.ts`): Is the Web Crypto API usage correct? Is the Node.js fallback safe? Could the environment detection fail in edge-case runtimes (Deno, Bun, Cloudflare Workers)?
- **Binary parsing**: Could a crafted `.ots` file cause excessive memory allocation, CPU spin, or stack overflow despite the existing limits?
- **Network calls** (`bitcoin.ts`, `stamp.ts`, `upgrade.ts`): Are responses validated sufficiently? Could a malicious calendar server or block explorer inject bad data that makes `verify()` return a false positive?
- **Supply chain**: Is the single dependency (`@noble/hashes`) a reasonable trust decision? Are there alternatives?
- **React components**: Any XSS vectors? Do components safely handle user-provided props (classNames, callbacks)?
- **Random number generation**: Is `crypto.getRandomValues()` used correctly for the privacy nonce?
- **Timing attacks**: Are there any comparisons of secret or security-critical data using `===` instead of constant-time comparison?

### 5. Testing

- **Coverage gaps**: Which functions or branches have no test coverage? Pay special attention to `verify.ts`, `stamp.ts`, `upgrade.ts`, and the React components.
- **Test quality**: Are the existing tests actually testing meaningful behavior, or are they trivial? Do they test failure modes and edge cases, not just happy paths?
- **Fixture quality**: Is the `hello-world.txt.ots` fixture sufficient? Should there be more fixtures (pending proofs, multi-attestation trees, malformed files)?
- **Missing test categories**: Are there integration tests? Property-based tests? Component tests for React?
- **Roundtrip testing**: The parser/writer roundtrip test exists — is it thorough enough?

### 6. Build & Distribution

- Is the Vite library-mode config correct? Are the `package.json` exports properly configured for ESM, CJS, and TypeScript consumers?
- Does the `files` field in `package.json` include everything needed and exclude everything unnecessary?
- Are peer dependencies correctly specified? Will this work with React 18 and React 19?
- Is the `tsconfig.json` appropriate for a library (target, module, declaration settings)?

### 7. Documentation & DX (Developer Experience)

- There is no README. What should it contain for a v0.1.0 release?
- Are the JSDoc comments and inline comments accurate and helpful?
- Are the exported types sufficient for consumers to use the library without reading source code?
- Are error messages clear enough for debugging?

### 8. Anything Else

If you notice anything else — performance concerns, accessibility issues in React components, spec compliance questions, naming inconsistencies, missing license headers, potential for confusion — include it. Surprise me.

## Desired Output Format

Please produce your review as a single Markdown file structured as follows:

```markdown
# zeitstempel-react Code Review

## Executive Summary
<!-- 3-5 sentence overall assessment: quality level, biggest strengths, most critical issues -->

## Critical Issues
<!-- Issues that MUST be fixed before any release. Security bugs, correctness errors, data loss risks. -->
<!-- For each: file, line number(s), description, suggested fix -->

## Important Issues
<!-- Issues that SHOULD be fixed soon. Significant code quality, testing, or design problems. -->

## Minor Issues
<!-- Nice-to-fix. Style, naming, small improvements. -->

## Architecture Assessment
<!-- Detailed evaluation of the module structure, type design, and component API -->

## Security Assessment
<!-- Detailed security analysis with specific findings -->

## Testing Assessment
<!-- Coverage analysis, quality evaluation, recommended additions -->

## Build & Distribution Assessment
<!-- Package config, build pipeline, compatibility -->

## Positive Observations
<!-- What's done well. Specific praise with examples. -->

## Recommended Next Steps
<!-- Prioritized list of actions before v1.0 release -->
```

For every issue, include:
- **File and line number(s)**
- **The problematic code** (quoted)
- **Why it's a problem**
- **A suggested fix** (code or description)

Save your output as `GEMINI_CODE_REVIEW.md` in the project root.
