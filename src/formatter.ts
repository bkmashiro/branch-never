import type { BlamedBranch } from "./blame.js";
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

export function formatBlameText(branches: BlamedBranch[]): string {
  const lines: string[] = [];

  lines.push(chalk.bold("Unreachable branches with blame:"));
  lines.push("");

  if (branches.length === 0) {
    lines.push(`  ${chalk.green("None")}`);
    return lines.join("\n");
  }

  for (const branch of branches) {
    lines.push(`  ${chalk.red(`${branch.file}:${branch.line}`)}  ${branch.conditionText}`);
    if (branch.blame) {
      lines.push(`    \u2192 Author: ${branch.blame.authorName} <${branch.blame.authorEmail}>`);
      lines.push(`    \u2192 Last modified: ${branch.blame.authorDate} (${branch.blame.relativeDays} days ago)`);
      lines.push(`    \u2192 Commit: "${branch.blame.commitSummary}"`);
    } else {
      lines.push("    \u2192 Author: unavailable");
      lines.push("    \u2192 Last modified: unavailable");
      lines.push("    \u2192 Commit: unavailable");
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
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
