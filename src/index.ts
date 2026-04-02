#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { analyzeAgainstBaseline, analyzeBranchCoverage, formatBaselineComparison } from "./baseline.js";
import { formatJson, formatText, type FormatPayload } from "./formatter.js";
import { generateHtmlReport } from "./html-report.js";

interface CliOptions {
  tests: string;
  json: boolean;
  fail: boolean;
  pattern: "env" | "retry" | "error" | "feature" | "all";
  threshold: string;
  report?: string;
  baseline?: string;
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

    if (options.baseline) {
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

    const shouldPrintText = !options.report || Boolean(options.baseline);

    if (options.json) {
      console.log(formatJson(comparison ? { ...payload, comparison } : payload));
    } else if (comparison && shouldPrintText) {
      console.log(formatBaselineComparison(comparison));
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
    if (options.fail && thresholdTriggered) {
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
