import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import type { BranchCoverage } from "./matcher.js";

const execFile = promisify(execFileCallback);

export interface BlameInfo {
  authorName: string;
  authorEmail: string;
  authorTime: number;
  authorDate: string;
  relativeDays: number;
  commitSummary: string;
  commitHash: string;
}

export interface BlamedBranch extends BranchCoverage {
  blame: BlameInfo | null;
}

export async function attachBlameToBranches(
  branches: BranchCoverage[],
  cwd = process.cwd(),
  now = new Date()
): Promise<BlamedBranch[]> {
  return Promise.all(branches.map(async (branch) => ({
    ...branch,
    blame: await loadBlameForBranch(branch, cwd, now)
  })));
}

export async function loadBlameForBranch(
  branch: Pick<BranchCoverage, "file" | "line">,
  cwd = process.cwd(),
  now = new Date()
): Promise<BlameInfo | null> {
  try {
    const { stdout } = await execFile(
      "git",
      ["blame", "--line-porcelain", "-L", `${branch.line},${branch.line}`, "--", branch.file],
      { cwd }
    );

    return parseBlamePorcelain(stdout, now);
  } catch {
    return null;
  }
}

export function parseBlamePorcelain(output: string, now = new Date()): BlameInfo | null {
  const lines = output.split("\n");
  const header = lines[0]?.trim() ?? "";
  const authorName = readBlameField(lines, "author");
  const authorEmail = stripAngleBrackets(readBlameField(lines, "author-mail"));
  const authorTimeText = readBlameField(lines, "author-time");
  const commitSummary = readBlameField(lines, "summary");
  const commitHash = header.split(" ")[0] ?? "";

  const authorTime = Number(authorTimeText);
  if (!commitHash || !authorName || !authorEmail || !Number.isFinite(authorTime) || !commitSummary) {
    return null;
  }

  return {
    authorName,
    authorEmail,
    authorTime,
    authorDate: formatDate(authorTime),
    relativeDays: calculateRelativeDays(authorTime, now),
    commitSummary,
    commitHash
  };
}

function readBlameField(lines: string[], field: string): string {
  const prefix = `${field} `;
  const match = lines.find((line) => line.startsWith(prefix));
  return match?.slice(prefix.length).trim() ?? "";
}

function stripAngleBrackets(value: string): string {
  return value.replace(/^<|>$/g, "");
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function calculateRelativeDays(unixSeconds: number, now: Date): number {
  const diffMs = now.getTime() - unixSeconds * 1000;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}
