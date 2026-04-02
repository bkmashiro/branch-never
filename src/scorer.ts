import type { BranchCoverage } from "./matcher.js";

export interface CoverageSummary {
  coveredCount: number;
  uncoveredCount: number;
  total: number;
  coveragePercent: number;
}

export type Severity = "low" | "medium" | "high";

export function calculateCoverage(results: BranchCoverage[]): CoverageSummary {
  const total = results.length;
  const coveredCount = results.filter((result) => result.covered).length;
  const uncoveredCount = total - coveredCount;
  const coveragePercent = total === 0 ? 100 : Math.round((coveredCount / total) * 100);

  return {
    coveredCount,
    uncoveredCount,
    total,
    coveragePercent
  };
}

export function branchSeverity(result: BranchCoverage): Severity {
  switch (result.pattern) {
    case "env":
    case "error":
      return "high";
    case "retry":
      return "medium";
    case "feature":
      return "low";
    default:
      return "medium";
  }
}
