import chalk from "chalk";
import type { BranchCoverage } from "./matcher.js";
import type { CoverageSummary } from "./scorer.js";

export interface FormatPayload {
  covered: BranchCoverage[];
  uncovered: BranchCoverage[];
  summary: CoverageSummary;
}

export function formatText(payload: FormatPayload): string {
  const lines: string[] = [];

  lines.push(chalk.bold("Analyzing import graph and branches..."));
  lines.push("");

  lines.push(chalk.bold.red("Uncovered branches (never referenced in any test):"));
  if (payload.uncovered.length === 0) {
    lines.push(`  ${chalk.green("None")}`);
  } else {
    for (const branch of payload.uncovered) {
      lines.push(
        `  ${chalk.red(`${branch.file}:${branch.line}`)}    ${branch.conditionText}  ${chalk.dim(
          `\u2190 ${describeUncovered(branch)}`
        )}`
      );
    }
  }

  lines.push("");
  lines.push(chalk.bold.green("Covered branches:"));
  if (payload.covered.length === 0) {
    lines.push(`  ${chalk.yellow("None")}`);
  } else {
    for (const branch of payload.covered) {
      const referencedBy = branch.matchedTestFiles[0] ?? "test";
      lines.push(
        `  ${chalk.green(`${branch.file}:${branch.line}`)}    ${branch.conditionText}  ${chalk.dim(
          `\u2190 referenced in ${referencedBy}`
        )}`
      );
    }
  }

  lines.push("");
  lines.push(
    `Summary: ${payload.summary.uncoveredCount} uncovered branches, ${payload.summary.coveredCount} covered. Coverage: ${payload.summary.coveragePercent}%`
  );

  return lines.join("\n");
}

export function formatJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function describeUncovered(branch: BranchCoverage): string {
  switch (branch.pattern) {
    case "env":
      return "env branch, no test";
    case "retry":
      return "retry logic, no test";
    case "error":
      return "error branch, no test";
    case "feature":
      return "feature flag, no test";
    default:
      return "no test";
  }
}
