import test from "node:test";
import assert from "node:assert/strict";
import { collectTestTokens, extractConditionTokens, matchBranchesToTests } from "../src/matcher.js";
import type { BranchMatch } from "../src/extractor.js";

test("extracts NODE_ENV token from env condition", () => {
  const tokens = extractConditionTokens("process.env.NODE_ENV");

  assert.deepEqual(tokens, ["NODE_ENV"]);
});

test("marks branch as covered when token appears in a test", () => {
  const branches: BranchMatch[] = [
    {
      file: "src/api.ts",
      line: 1,
      conditionText: "process.env.NODE_ENV",
      pattern: "env",
      kind: "if"
    }
  ];

  const results = matchBranchesToTests(
    branches,
    new Map([["test/api.test.ts", `test('uses NODE_ENV', () => expect('NODE_ENV').toBeTruthy())`]])
  );

  assert.equal(results[0]?.covered, true);
});

test("marks branch as uncovered when token does not appear in tests", () => {
  const branches: BranchMatch[] = [
    {
      file: "src/api.ts",
      line: 1,
      conditionText: "process.env.NODE_ENV",
      pattern: "env",
      kind: "if"
    }
  ];

  const results = matchBranchesToTests(
    branches,
    new Map([["test/api.test.ts", `test('uses cache', () => expect(true).toBeTruthy())`]])
  );

  assert.equal(results[0]?.covered, false);
});

test("marks branch as covered when any test file contains a token", () => {
  const branches: BranchMatch[] = [
    {
      file: "src/api.ts",
      line: 1,
      conditionText: "process.env.NODE_ENV",
      pattern: "env",
      kind: "if"
    }
  ];

  const results = matchBranchesToTests(
    branches,
    new Map([
      ["test/a.test.ts", `test('a', () => expect(true).toBeTruthy())`],
      ["test/b.test.ts", `test('b', () => expect('NODE_ENV').toBeTruthy())`]
    ])
  );

  assert.equal(results[0]?.covered, true);
  assert.deepEqual(results[0]?.matchedTestFiles, ["test/b.test.ts"]);
});

test("ignores comment text when collecting test tokens", () => {
  const tokens = collectTestTokens(`// mentions NODE_ENV\nconst status = 404`);

  assert.equal(tokens.has("NODE_ENV"), false);
  assert.equal(tokens.has("status"), true);
});
