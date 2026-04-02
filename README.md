[![npm](https://img.shields.io/npm/v/branch-never)](https://www.npmjs.com/package/branch-never) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# branch-never

`branch-never` is a static-analysis CLI for TypeScript and JavaScript projects. It scans source files for high-value conditional branches and flags the ones whose key tokens never appear in any test file.

It is intentionally heuristic-based: no runtime instrumentation, no AST parser, and no execution. The goal is to quickly surface risky branches that look untested.

## Install

```bash
pnpm add -D branch-never
```

Or run it locally in this repository:

```bash
pnpm install
pnpm build
node dist/index.js src --tests test
```

## Usage

```bash
branch-never <src-dir> [options]

Options:
  --tests <dir>     Test directory (default: test/)
  --json            JSON output
  --no-fail         Don't exit 1 when uncovered branches found
  --pattern <type>  Only check: env|retry|error|feature|all (default: all)
  --threshold <pct> Fail if coverage below N% (default: 0, fail on any)
  --report <file>   Write an HTML report
  --baseline <ref>  Compare current uncovered branches against a git ref
```

Example output:

```text
Analyzing import graph and branches...

Uncovered branches (never referenced in any test):
  src/api.ts:42    if (process.env.NODE_ENV === 'production')  <- env branch, no test

Covered branches:
  src/auth.ts:15   if (!token)  <- referenced in test/auth.test.ts

Summary: 1 uncovered branches, 1 covered. Coverage: 50%
```

HTML report:

```bash
branch-never src --tests test --report report.html
```

Baseline comparison:

```bash
branch-never src --tests test --baseline main
```

## What It Detects

The extractor looks for these branch shapes using regex:

- `if (...)`
- `catch (...) { ... }` blocks with error property checks
- Ternary conditions like `condition ? a : b`
- Short-circuit expressions like `a && b` or `a || b` when they include env/config checks

It only reports branches whose condition matches one of these interesting patterns:

- `process.env.*` and `NODE_ENV === "..."` checks
- Retry and timeout logic such as `retries > 3`, `attempts >= 2`, `timeout`
- Error type/status/code checks such as `err.code === "EXPIRED"`
- Feature flags such as `feature.someFlag`

Coverage is approximated by extracting tokens from each condition and checking whether any test file contains them.

## Compared To Istanbul or c8

`branch-never` is not a replacement for Istanbul or `c8`.

- `branch-never` is static and heuristic-based, so it can run without executing tests.
- Istanbul and `c8` are runtime coverage tools, so they produce precise statement and branch coverage from real execution.
- `branch-never` is useful when you want a fast signal about suspicious branches before full runtime coverage is available.

The tradeoff is precision: runtime coverage is more accurate, while `branch-never` is faster to adopt and easier to run in lightweight environments.
