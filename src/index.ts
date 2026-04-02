#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { attachBlameToBranches } from "./blame.js";
import { Command } from "commander";
import {
  analyzeAgainstBaseline,
  analyzeBranchCoverage,
  analyzePrCheck,
  formatBaselineComparison,
  formatPrCheckComparison
} from "./baseline.js";
import { formatBlameText, formatJson, formatText, type FormatPayload } from "./formatter.js";
import { generateHtmlReport } from "./html-report.js";

interface CliOptions {
  tests: string;
  json: boolean;
  fail: boolean;
  pattern: "env" | "retry" | "error" | "feature" | "all";
  threshold: string;
  report?: string;
  baseline?: string;
  blame: boolean;
  prCheck: boolean;
}

const program = new Command();

program
  .name("branch-never")
  .argument("<src-dir>", "Source directory to analyze")
  .option("--tests <dir>", "Test directory", "test/")
  .option("--json", "Emit JSON output", false)
  .option("--no-fail", "Don't exit 1 when uncovered branches found")
  .option("--pattern <type>", "Only check: env|retry|error|feature|all", "all")
  .option("--threshold <pct>", "Fail if coverage below N% (default: 0, fail on any)", "0")
  .option("--report <output-file>", "Write an HTML report to a file")
  .option("--baseline <branch>", "Compare current uncovered branches against a git ref")
  .option("--blame", "Show git blame metadata for each unreachable branch", false)
  .option("--pr-check", "Compare current unreachable branches against a baseline JSON file", false)
  .action(async (srcDir: string, options: CliOptions) => {
    const threshold = Number(options.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      console.error("Invalid --threshold value. Expected a number between 0 and 100.");
      process.exitCode = 2;
      return;
    }

    if (!["env", "retry", "error", "feature", "all"].includes(options.pattern)) {
      console.error("Invalid --pattern value. Expected env|retry|error|feature|all.");
      process.exitCode = 2;
      return;
    }

    let payload: FormatPayload;
    let comparison;
    let prCheck;
    let blamedUncovered = null;

    if (options.prCheck && !options.baseline) {
      console.error("Missing --baseline value. --pr-check expects a baseline JSON file path.");
      process.exitCode = 2;
      return;
    }

    if (options.prCheck && options.baseline) {
      prCheck = await analyzePrCheck({
        srcDir,
        testsDir: options.tests,
        pattern: options.pattern,
        baselinePath: options.baseline
      });
      payload = prCheck.current;
    } else if (options.baseline) {
      comparison = await analyzeAgainstBaseline({
        srcDir,
        testsDir: options.tests,
        pattern: options.pattern,
        baselineRef: options.baseline
      });
      payload = comparison.current;
    } else {
      payload = await analyzeBranchCoverage({
        srcDir,
        testsDir: options.tests,
        pattern: options.pattern
      });
    }

    if (options.blame) {
      blamedUncovered = await attachBlameToBranches(payload.uncovered);
    }

    const shouldPrintText = !options.report || Boolean(options.baseline);

    if (options.json) {
      const basePayload = blamedUncovered ? { ...payload, uncovered: blamedUncovered } : payload;
      if (prCheck) {
        console.log(formatJson({ ...basePayload, prCheck }));
      } else {
        console.log(formatJson(comparison ? { ...basePayload, comparison } : basePayload));
      }
    } else if (prCheck && shouldPrintText) {
      console.log(formatPrCheckComparison(prCheck));
    } else if (comparison && shouldPrintText) {
      console.log(formatBaselineComparison(comparison));
    } else if (blamedUncovered && shouldPrintText) {
      console.log(formatBlameText(blamedUncovered));
    } else if (shouldPrintText) {
      console.log(formatText(payload));
    }

    if (options.report) {
      const html = await generateHtmlReport(payload, { baselineComparison: comparison });
      await writeFile(options.report, html, "utf8");
      const target = `Generated: ${options.report}`;
      if (options.json) {
        console.error(target);
      } else {
        console.log(target);
      }
    }

    const thresholdTriggered =
      threshold > 0 ? payload.summary.coveragePercent < threshold : payload.uncovered.length > 0;
    if (prCheck) {
      if (prCheck.newUnreachable.length > 0) {
        process.exitCode = 1;
      }
    } else if (options.fail && thresholdTriggered) {
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
