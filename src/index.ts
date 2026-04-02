#!/usr/bin/env node
import { Command } from "commander";
import { extractBranchesFromDirectory } from "./extractor.js";
import { formatJson, formatText } from "./formatter.js";
import { loadTestFiles, matchBranchesToTests } from "./matcher.js";
import { calculateCoverage } from "./scorer.js";

interface CliOptions {
  tests: string;
  json: boolean;
  fail: boolean;
  pattern: "env" | "retry" | "error" | "feature" | "all";
  threshold: string;
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

    const branches = await extractBranchesFromDirectory(srcDir, options.pattern);
    const testFiles = await loadTestFiles(options.tests);
    const results = matchBranchesToTests(branches, testFiles);
    const covered = results.filter((result) => result.covered);
    const uncovered = results.filter((result) => !result.covered);
    const summary = calculateCoverage(results);
    const payload = { covered, uncovered, summary };

    if (options.json) {
      console.log(formatJson(payload));
    } else {
      console.log(formatText(payload));
    }

    const thresholdTriggered = threshold > 0 ? summary.coveragePercent < threshold : uncovered.length > 0;
    if (options.fail && thresholdTriggered) {
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
