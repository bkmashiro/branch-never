import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { extractBranchesFromDirectory, type PatternType } from "./extractor.js";
import type { FormatPayload } from "./formatter.js";
import { loadTestFiles, matchBranchesToTests, type BranchCoverage } from "./matcher.js";
import { calculateCoverage } from "./scorer.js";

const execFile = promisify(execFileCallback);

export interface AnalysisOptions {
  srcDir: string;
  testsDir: string;
  pattern: PatternType | "all";
  cwd?: string;
}

export interface BaselineComparison {
  baselineRef: string;
  baseline: FormatPayload;
  current: FormatPayload;
  newlyUncovered: BranchCoverage[];
  newlyCovered: BranchCoverage[];
  netChange: number;
}

interface GitResult {
  stdout: string;
  stderr: string;
}

export async function analyzeBranchCoverage(options: AnalysisOptions): Promise<FormatPayload> {
  const cwd = options.cwd ?? process.cwd();
  const branches = await extractBranchesFromDirectory(options.srcDir, options.pattern, cwd);
  const testFiles = await loadTestFiles(options.testsDir, cwd);
  const results = matchBranchesToTests(branches, testFiles);
  const covered = results.filter((result) => result.covered);
  const uncovered = results.filter((result) => !result.covered);

  return {
    covered,
    uncovered,
    summary: calculateCoverage(results)
  };
}

export function compareUncoveredBranches(
  baselineRef: string,
  baseline: FormatPayload,
  current: FormatPayload
): BaselineComparison {
  const baselineKeys = new Map(baseline.uncovered.map((branch) => [branchIdentity(branch), branch]));
  const currentKeys = new Map(current.uncovered.map((branch) => [branchIdentity(branch), branch]));
  const newlyUncovered = [...currentKeys.entries()]
    .filter(([key]) => !baselineKeys.has(key))
    .map(([, branch]) => branch)
    .sort(compareBranches);
  const newlyCovered = [...baselineKeys.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, branch]) => branch)
    .sort(compareBranches);

  return {
    baselineRef,
    baseline,
    current,
    newlyUncovered,
    newlyCovered,
    netChange: newlyCovered.length - newlyUncovered.length
  };
}

export async function analyzeAgainstBaseline(options: AnalysisOptions & { baselineRef: string }): Promise<BaselineComparison> {
  const cwd = options.cwd ?? process.cwd();
  const current = await analyzeBranchCoverage(options);
  const restoreRef = await resolveRestoreRef(cwd);
  const stashRef = await stashWorkspaceIfNeeded(cwd);

  let baseline: FormatPayload | null = null;

  try {
    await git(["checkout", options.baselineRef], cwd);
    baseline = await analyzeBranchCoverage({ ...options, cwd });
  } finally {
    await git(["checkout", restoreRef], cwd);
    if (stashRef) {
      await git(["stash", "pop", "--index", stashRef], cwd);
    }
  }

  return compareUncoveredBranches(options.baselineRef, baseline, current);
}

export function formatBaselineComparison(comparison: BaselineComparison): string {
  const lines: string[] = [];

  lines.push(`Comparing branch coverage: ${comparison.baselineRef} \u2192 HEAD`);
  lines.push("");

  lines.push(`Newly uncovered branches (${comparison.newlyUncovered.length}):`);
  if (comparison.newlyUncovered.length === 0) {
    lines.push("  None");
  } else {
    for (const branch of comparison.newlyUncovered) {
      lines.push(`  ${branch.file}:${branch.line}   ${branch.conditionText}   \u2190 added in this PR, not tested`);
    }
  }

  lines.push("");
  lines.push(`Newly covered branches (${comparison.newlyCovered.length}):`);
  if (comparison.newlyCovered.length === 0) {
    lines.push("  None");
  } else {
    for (const branch of comparison.newlyCovered) {
      lines.push(`  ${branch.file}:${branch.line}   ${branch.conditionText}   \u2190 you added a test \u2713`);
    }
  }

  lines.push("");
  const direction = comparison.netChange > 0 ? "improvement" : comparison.netChange < 0 ? "regression" : "no change";
  const signed = comparison.netChange > 0 ? `+${comparison.netChange}` : `${comparison.netChange}`;
  lines.push(`Net: ${signed} branches (${direction})`);

  return lines.join("\n");
}

async function resolveRestoreRef(cwd: string): Promise<string> {
  const branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd, true)).stdout.trim();
  if (branch) {
    return branch;
  }

  return (await git(["rev-parse", "HEAD"], cwd)).stdout.trim();
}

async function stashWorkspaceIfNeeded(cwd: string): Promise<string | null> {
  const status = (await git(["status", "--porcelain"], cwd)).stdout.trim();
  if (!status) {
    return null;
  }

  const marker = `branch-never-baseline-${Date.now()}`;
  await git(["stash", "push", "--include-untracked", "--message", marker], cwd);
  const list = (await git(["stash", "list", "--format=%gd %gs"], cwd)).stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.endsWith(marker));

  return list?.split(" ")[0] ?? null;
}

async function git(args: string[], cwd: string, allowFailure = false): Promise<GitResult> {
  try {
    return await execFile("git", args, { cwd });
  } catch (error) {
    if (allowFailure && error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      return {
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? "")
      };
    }

    throw error;
  }
}

function branchIdentity(branch: BranchCoverage): string {
  return [branch.file, branch.line, branch.pattern, branch.kind, branch.conditionText].join(":");
}

function compareBranches(left: BranchCoverage, right: BranchCoverage): number {
  if (left.file === right.file) {
    return left.line - right.line;
  }

  return left.file.localeCompare(right.file);
}
