import test from "node:test";
import assert from "node:assert/strict";
import { loadTestFiles, extractConditionTokens, collectTestTokens, matchBranchesToTests } from "../src/matcher.js";
import { calculateCoverage, branchSeverity } from "../src/scorer.js";
import { formatJson, formatText } from "../src/formatter.js";
import type { BranchMatch } from "../src/extractor.js";

test("extractConditionTokens keeps strings and filters short lowercase identifiers", () => {
  const tokens = extractConditionTokens(`if (err.status === "EXPIRED" || ok || API_KEY)`);

  assert.deepEqual(tokens, ["EXPIRED", "err", "status", "API_KEY"]);
});

test("collectTestTokens strips block comments and keeps code identifiers", () => {
  const tokens = collectTestTokens(`/* mention FEATURE_X */ const featureName = "FEATURE_X";`);

  assert.equal(tokens.has("mention"), false);
  assert.equal(tokens.has("FEATURE_X"), true);
  assert.equal(tokens.has("featureName"), true);
});

test("loadTestFiles reads fixture tests and tokenizes them", async () => {
  const files = await loadTestFiles("test/fixtures/test");
  const record = files.get("test/fixtures/test/api.test.ts");

  assert.equal(files.size, 1);
  assert.ok(record);
  assert.equal(record?.contents.includes("throws on 404"), true);
  assert.equal(record?.tokens.has("404"), false);
  assert.equal(record?.tokens.has("throws on 404"), true);
  assert.equal(record?.tokens.has("status"), true);
});

test("matchBranchesToTests supports pre-tokenized records and empty-token branches", () => {
  const branches: BranchMatch[] = [
    {
      file: "src/api.ts",
      line: 5,
      conditionText: `err.status === "EXPIRED"`,
      pattern: "error",
      kind: "if"
    },
    {
      file: "src/api.ts",
      line: 6,
      conditionText: "if",
      pattern: "retry",
      kind: "if"
    }
  ];

  const results = matchBranchesToTests(
    branches,
    new Map([
      [
        "test/api.test.ts",
        {
          contents: "",
          tokens: new Set(["EXPIRED", "status"])
        }
      ]
    ])
  );

  assert.equal(results[0]?.covered, true);
  assert.deepEqual(results[0]?.matchedTokens.sort(), ["EXPIRED", "status"]);
  assert.deepEqual(results[0]?.matchedTestFiles, ["test/api.test.ts"]);
  assert.equal(results[1]?.covered, false);
  assert.deepEqual(results[1]?.tokens, []);
});

test("formatter and scorer handle empty and non-empty payloads", () => {
  const covered = [
    {
      file: "src/api.ts",
      line: 1,
      conditionText: "process.env.NODE_ENV",
      pattern: "env",
      kind: "if",
      covered: true,
      matchedTokens: ["NODE_ENV"],
      matchedTestFiles: ["test/api.test.ts"],
      tokens: ["NODE_ENV"]
    }
  ];
  const uncovered = [
    {
      file: "src/api.ts",
      line: 2,
      conditionText: "feature.flag",
      pattern: "feature",
      kind: "if",
      covered: false,
      matchedTokens: [],
      matchedTestFiles: [],
      tokens: ["feature", "flag"]
    }
  ];
  const summary = calculateCoverage([...covered, ...uncovered]);

  assert.deepEqual(summary, {
    coveredCount: 1,
    uncoveredCount: 1,
    total: 2,
    coveragePercent: 50
  });
  assert.equal(calculateCoverage([]).coveragePercent, 100);
  assert.equal(branchSeverity(covered[0]!), "high");
  assert.equal(branchSeverity(uncovered[0]!), "low");
  assert.equal(branchSeverity({ ...uncovered[0]!, pattern: "retry" }), "medium");
  assert.match(formatText({ covered, uncovered, summary }), /env branch, no test|feature flag, no test/);
  assert.match(formatText({ covered: [], uncovered: [], summary: calculateCoverage([]) }), /None/);
  assert.match(formatJson({ covered, uncovered, summary }), /"coveragePercent": 50/);
});
