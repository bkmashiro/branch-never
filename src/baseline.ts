import { readFile } from "node:fs/promises";
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

export interface PrCheckComparison {
  baselinePath: string;
  baseline: FormatPayload;
  current: FormatPayload;
  newUnreachable: BranchCoverage[];
  resolvedUnreachable: BranchCoverage[];
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

export async function analyzePrCheck(
  options: AnalysisOptions & { baselinePath: string }
): Promise<PrCheckComparison> {
  const current = await analyzeBranchCoverage(options);
  const baseline = await loadBaselinePayload(options.baselinePath);
  return comparePrBaseline(options.baselinePath, baseline, current);
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

export function comparePrBaseline(
  baselinePath: string,
  baseline: FormatPayload,
  current: FormatPayload
): PrCheckComparison {
  const baselineKeys = new Map(baseline.uncovered.map((branch) => [branchIdentity(branch), branch]));
  const currentKeys = new Map(current.uncovered.map((branch) => [branchIdentity(branch), branch]));
  const newUnreachable = [...currentKeys.entries()]
    .filter(([key]) => !baselineKeys.has(key))
    .map(([, branch]) => branch)
    .sort(compareBranches);
  const resolvedUnreachable = [...baselineKeys.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, branch]) => branch)
    .sort(compareBranches);

  return {
    baselinePath,
    baseline,
    current,
    newUnreachable,
    resolvedUnreachable
  };
}

export async function loadBaselinePayload(baselinePath: string): Promise<FormatPayload> {
  const raw = await readFile(baselinePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (isFormatPayload(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed) && parsed.every(isBranchCoverage)) {
    return {
      covered: [],
      uncovered: parsed,
      summary: calculateCoverage(parsed)
    };
  }

  throw new Error(`Invalid baseline file: ${baselinePath}`);
}

export function formatPrCheckComparison(comparison: PrCheckComparison): string {
  const lines: string[] = [];

  lines.push("Comparing against baseline...");
  lines.push(`  Baseline: ${comparison.baseline.uncovered.length} unreachable branches`);
  lines.push(`  Current:  ${comparison.current.uncovered.length} unreachable branches`);
  lines.push("");

  if (comparison.newUnreachable.length === 0) {
    lines.push("No new unreachable branches introduced in this PR.");
    lines.push("");
    lines.push("\u2705 PR check passed");
    return lines.join("\n");
  }

  lines.push("New unreachable branches introduced in this PR:");
  for (const branch of comparison.newUnreachable) {
    lines.push(`  ${branch.file}:${branch.line}  ${branch.conditionText}  \u2190 NEW`);
  }
  lines.push("");
  lines.push(`\u274c PR check failed: ${comparison.newUnreachable.length} new unreachable branches`);

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

function isFormatPayload(value: unknown): value is FormatPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<FormatPayload>;
  return Array.isArray(candidate.covered) && Array.isArray(candidate.uncovered) && candidate.summary !== undefined;
}

function isBranchCoverage(value: unknown): value is BranchCoverage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BranchCoverage>;
  return (
    typeof candidate.file === "string" &&
    typeof candidate.line === "number" &&
    typeof candidate.conditionText === "string" &&
    typeof candidate.pattern === "string" &&
    typeof candidate.kind === "string"
  );
}
