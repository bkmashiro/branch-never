import test from "node:test";
import assert from "node:assert/strict";
import { parseBlamePorcelain } from "../src/blame.js";

test("parseBlamePorcelain extracts author, date, commit summary, and relative age", () => {
  const blame = parseBlamePorcelain(
    [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 45 45 1",
      "author alice",
      "author-mail <alice@co.com>",
      "author-time 1705276800",
      "summary add superadmin role",
      "\tif (user.role === 'superadmin')"
    ].join("\n"),
    new Date("2024-04-18T00:00:00Z")
  );

  assert.deepEqual(blame, {
    authorName: "alice",
    authorEmail: "alice@co.com",
    authorTime: 1705276800,
    authorDate: "2024-01-15",
    relativeDays: 94,
    commitSummary: "add superadmin role",
    commitHash: "abcd1234abcd1234abcd1234abcd1234abcd1234"
  });
});

test("parseBlamePorcelain returns null for incomplete blame output", () => {
  assert.equal(parseBlamePorcelain(""), null);
});
