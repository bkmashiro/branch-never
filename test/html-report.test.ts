import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compareUncoveredBranches } from "../src/baseline.js";
import { generateHtmlReport } from "../src/html-report.js";
import type { FormatPayload } from "../src/formatter.js";

test("generateHtmlReport includes summaries, links, source highlights, and trend section", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "branch-never-report-"));
  await mkdir(path.join(cwd, "src"), { recursive: true });
  await writeFile(
    path.join(cwd, "src/api.ts"),
    `export function load(err: { code?: string }) {\n  if (process.env.FEATURE_X) return "flag";\n  if (err.code === "TIMEOUT") return "retry";\n  return "ok";\n}\n`,
    "utf8"
  );

  const current: FormatPayload = {
    covered: [
      {
        file: "src/api.ts",
        line: 3,
        conditionText: `err.code === "TIMEOUT"`,
        pattern: "error",
        kind: "if",
        covered: true,
        matchedTokens: ["TIMEOUT"],
        matchedTestFiles: ["test/api.test.ts"],
        tokens: ["err", "code", "TIMEOUT"]
      }
    ],
    uncovered: [
      {
        file: "src/api.ts",
        line: 2,
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
  const baseline: FormatPayload = {
    covered: [],
    uncovered: [
      {
        ...current.covered[0]!,
        covered: false,
        matchedTokens: [],
        matchedTestFiles: []
      }
    ],
    summary: { coveredCount: 0, uncoveredCount: 1, total: 1, coveragePercent: 0 }
  };

  const html = await generateHtmlReport(current, {
    cwd,
    baselineComparison: compareUncoveredBranches("main", baseline, current)
  });

  assert.match(html, /<h2>Files<\/h2>/);
  assert.match(html, /src\/api\.ts/);
  assert.match(html, /href="#branch-src-api-ts-2-env-if-process-env-feature-x"/);
  assert.match(html, /<span class="pill pill-uncovered">uncovered<\/span>/);
  assert.match(html, /<tr class="uncovered">/);
  assert.match(html, /<tr class="covered">/);
  assert.match(html, /Comparing branch coverage: main &rarr; HEAD/);
});
