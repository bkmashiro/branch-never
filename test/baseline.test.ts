import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { analyzeAgainstBaseline, compareUncoveredBranches } from "../src/baseline.js";
import type { FormatPayload } from "../src/formatter.js";

const execFile = promisify(execFileCallback);

test("compareUncoveredBranches detects newly covered and newly uncovered branches", () => {
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
    covered: [
      {
        ...baseline.uncovered[0]!,
        covered: true,
        matchedTokens: ["retries"],
        matchedTestFiles: ["test/api.test.ts"]
      }
    ],
    uncovered: [
      {
        file: "src/api.ts",
        line: 12,
        conditionText: "process.env.FEATURE_X",
        pattern: "env",
        kind: "if",
        covered: false,
        matchedTokens: [],
        matchedTestFiles: [],
        tokens: ["FEATURE_X"]
      }
    ],
    summary: { coveredCount: 1, uncoveredCount: 1, total: 2, coveragePercent: 50 }
  };

  const comparison = compareUncoveredBranches("main", baseline, current);

  assert.equal(comparison.newlyCovered.length, 1);
  assert.equal(comparison.newlyCovered[0]?.conditionText, "retries > 3");
  assert.equal(comparison.newlyUncovered.length, 1);
  assert.equal(comparison.newlyUncovered[0]?.conditionText, "process.env.FEATURE_X");
  assert.equal(comparison.netChange, 0);
});

test("analyzeAgainstBaseline compares current branch to git baseline and restores stashed files", async () => {
  const repoDir = await mkdtemp(path.join(tmpdir(), "branch-never-baseline-"));
  await mkdir(path.join(repoDir, "src"), { recursive: true });
  await mkdir(path.join(repoDir, "test"), { recursive: true });

  await git(["init", "-b", "main"], repoDir);
  await git(["config", "user.name", "Branch Never"], repoDir);
  await git(["config", "user.email", "branch-never@example.com"], repoDir);

  await writeFile(
    path.join(repoDir, "src/app.ts"),
    `export function run(retries: number) {\n  if (retries > 3) {\n    return "stop";\n  }\n  return "ok";\n}\n`,
    "utf8"
  );
  await writeFile(path.join(repoDir, "test/app.test.ts"), `test("smoke", () => expect(true).toBeTruthy())\n`, "utf8");
  await git(["add", "."], repoDir);
  await git(["commit", "-m", "base"], repoDir);

  await git(["checkout", "-b", "feature"], repoDir);
  await writeFile(
    path.join(repoDir, "src/app.ts"),
    `export function run(retries: number) {\n  if (retries > 3) {\n    return "stop";\n  }\n  if (process.env.FEATURE_X) {\n    return "feature";\n  }\n  return "ok";\n}\n`,
    "utf8"
  );
  await writeFile(
    path.join(repoDir, "test/app.test.ts"),
    `test("mentions retries", () => expect("retries").toBeTruthy())\n`,
    "utf8"
  );
  await git(["add", "."], repoDir);
  await git(["commit", "-m", "feature"], repoDir);

  await writeFile(path.join(repoDir, "scratch.txt"), "keep me\n", "utf8");

  const comparison = await analyzeAgainstBaseline({
    cwd: repoDir,
    srcDir: "src",
    testsDir: "test",
    pattern: "all",
    baselineRef: "main"
  });

  assert.equal(comparison.newlyUncovered.length, 1);
  assert.equal(comparison.newlyUncovered[0]?.conditionText, "process.env.FEATURE_X");
  assert.equal(comparison.newlyCovered.length, 1);
  assert.equal(comparison.newlyCovered[0]?.conditionText, "retries > 3");
  assert.equal(await readFile(path.join(repoDir, "scratch.txt"), "utf8"), "keep me\n");
  assert.equal((await git(["branch", "--show-current"], repoDir)).trim(), "feature");
});

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile("git", args, { cwd });
  return stdout;
}
