import test from "node:test";
import assert from "node:assert/strict";
import { extractInterestingBranches } from "../src/extractor.js";

test("detects env branch", () => {
  const source = `if (process.env.NODE_ENV === 'production') {\n  run()\n}`;
  const result = extractInterestingBranches(source);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.pattern, "env");
});

test("detects retry branch", () => {
  const source = `if (retries > 3) {\n  throw new Error('fail')\n}`;
  const result = extractInterestingBranches(source);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.pattern, "retry");
});

test("detects error branch", () => {
  const source = `if (err.code === 'EXPIRED') {\n  return false\n}`;
  const result = extractInterestingBranches(source);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.pattern, "error");
});

test("ignores uninteresting branch", () => {
  const source = `if (user.name === 'alice') {\n  return true\n}`;
  const result = extractInterestingBranches(source);

  assert.equal(result.length, 0);
});

test("returns correct line numbers", () => {
  const source = `const a = 1\nconst b = 2\nif (process.env.NODE_ENV === 'production') {\n  run()\n}`;
  const result = extractInterestingBranches(source, "src/api.ts");

  assert.equal(result[0]?.line, 3);
  assert.equal(result[0]?.file, "src/api.ts");
});
