import test from "node:test";
import assert from "node:assert/strict";
import { extractBranchesFromDirectory, extractInterestingBranches, detectPattern, normalizeCondition } from "../src/extractor.js";

test("detects catch branches, ternaries, short-circuits, and deduplicates duplicates", () => {
  const source = `
try {
  run();
} catch (err) {
  if (err.code === "EXPIRED") return retry();
  if (err.code === "EXPIRED") return retryAgain();
}
const mode = process.env.NODE_ENV === "production" ? "prod" : "dev";
const enabled = process.env.FEATURE_X && start();
`;

  const result = extractInterestingBranches(source, "src/example.ts");

  assert.equal(result.length, 6);
  assert.equal(
    result.filter((branch) => branch.kind === "catch" && branch.conditionText === `err.code === "EXPIRED"`).length,
    2
  );
  assert.equal(
    result.filter((branch) => branch.kind === "if" && branch.conditionText === `err.code === "EXPIRED"`).length,
    2
  );
  assert.equal(result.some((branch) => branch.kind === "ternary" && branch.pattern === "env"), true);
  assert.equal(result.some((branch) => branch.kind === "short-circuit" && branch.pattern === "env"), true);
});

test("normalizes whitespace and exposes short-circuit env fallback in detectPattern", () => {
  assert.equal(normalizeCondition("  process.env.NODE_ENV   ===  'prod'  "), "process.env.NODE_ENV === 'prod'");
  assert.equal(detectPattern("cfg.release || init()", "short-circuit"), "env");
  assert.equal(detectPattern("user.name === 'alice'"), null);
});

test("extractBranchesFromDirectory loads files, ignores d.ts, and filters by pattern", async () => {
  const envOnly = await extractBranchesFromDirectory("test/fixtures/src", "env");
  const all = await extractBranchesFromDirectory("test/fixtures/src", "all");

  assert.equal(envOnly.length, 1);
  assert.equal(envOnly[0]?.file, "test/fixtures/src/api.ts");
  assert.equal(envOnly[0]?.pattern, "env");
  assert.equal(all.length, 1);
});
