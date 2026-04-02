import test from "node:test";
import assert from "node:assert/strict";
import { comparePrBaseline } from "../src/baseline.js";
import type { FormatPayload } from "../src/formatter.js";

test("comparePrBaseline reports new unreachable branches in current results", () => {
  const baseline: FormatPayload = {
    covered: [],
    uncovered: [
      {
        file: "src/api.ts",
        line: 10,
        conditionText: "retries > 3",
        pattern: "retry",
        kind: "if",
        covered: false,
        matchedTokens: [],
        matchedTestFiles: [],
        tokens: ["retries"]
      }
    ],
    summary: { coveredCount: 0, uncoveredCount: 1, total: 1, coveragePercent: 0 }
  };
  const current: FormatPayload = {
    covered: [],
    uncovered: [
      baseline.uncovered[0]!,
      {
        file: "src/payment.ts",
        line: 67,
        conditionText: "currency === 'BTC'",
        pattern: "feature",
        kind: "if",
        covered: false,
        matchedTokens: [],
        matchedTestFiles: [],
        tokens: ["currency", "BTC"]
      }
    ],
    summary: { coveredCount: 0, uncoveredCount: 2, total: 2, coveragePercent: 0 }
  };

  const comparison = comparePrBaseline(".branch-never-baseline.json", baseline, current);

  assert.equal(comparison.newUnreachable.length, 1);
  assert.equal(comparison.newUnreachable[0]?.file, "src/payment.ts");
  assert.equal(comparison.resolvedUnreachable.length, 0);
});

test("comparePrBaseline reports resolved unreachable branches", () => {
  const baseline: FormatPayload = {
    covered: [],
    uncovered: [
      {
        file: "src/api.ts",
        line: 10,
        conditionText: "retries > 3",
        pattern: "retry",
        kind: "if",
        covered: false,
        matchedTokens: [],
        matchedTestFiles: [],
        tokens: ["retries"]
      }
    ],
    summary: { coveredCount: 0, uncoveredCount: 1, total: 1, coveragePercent: 0 }
  };
  const current: FormatPayload = {
    covered: [],
    uncovered: [],
    summary: { coveredCount: 1, uncoveredCount: 0, total: 1, coveragePercent: 100 }
  };

  const comparison = comparePrBaseline(".branch-never-baseline.json", baseline, current);

  assert.equal(comparison.newUnreachable.length, 0);
  assert.equal(comparison.resolvedUnreachable.length, 1);
  assert.equal(comparison.resolvedUnreachable[0]?.conditionText, "retries > 3");
});
