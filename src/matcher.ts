import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import type { BranchMatch } from "./extractor.js";

export interface BranchCoverage extends BranchMatch {
  covered: boolean;
  matchedTokens: string[];
  matchedTestFiles: string[];
  tokens: string[];
}

export interface TestFileRecord {
  contents: string;
  tokens: Set<string>;
}

const FILE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
const RESERVED = new Set([
  "if",
  "else",
  "catch",
  "true",
  "false",
  "null",
  "undefined",
  "return",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "process",
  "env"
]);

export function extractConditionTokens(conditionText: string): string[] {
  const tokens = new Set<string>();

  for (const match of conditionText.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    tokens.add(match[1]);
  }

  for (const match of conditionText.matchAll(/["'`]([^"'`]{2,})["'`]/g)) {
    tokens.add(match[1]);
  }

  for (const match of conditionText.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const token = match[0];
    if (RESERVED.has(token)) {
      continue;
    }
    if (token.length < 3 && !/^[A-Z0-9_]+$/.test(token)) {
      continue;
    }
    tokens.add(token);
  }

  return [...tokens];
}

export function collectTestTokens(contents: string): Set<string> {
  const stripped = contents
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
  const tokens = new Set<string>();

  for (const match of stripped.matchAll(/["'`]([^"'`]{2,})["'`]/g)) {
    tokens.add(match[1]);
  }

  for (const match of stripped.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const token = match[0];
    if (RESERVED.has(token)) {
      continue;
    }
    tokens.add(token);
  }

  return tokens;
}

export async function loadTestFiles(testDir: string): Promise<Map<string, TestFileRecord>> {
  const absoluteDir = path.resolve(testDir);
  const files = await glob(FILE_GLOB, {
    absolute: true,
    cwd: absoluteDir,
    nodir: true,
    ignore: ["**/*.d.ts"]
  });

  const entries = await Promise.all(
    files.map(async (file) => {
      const contents = await readFile(file, "utf8");
      return [
        path.relative(process.cwd(), file),
        {
          contents,
          tokens: collectTestTokens(contents)
        }
      ] as const;
    })
  );

  return new Map(entries);
}

export function matchBranchesToTests(
  branches: BranchMatch[],
  testFiles: Map<string, string | TestFileRecord>
): BranchCoverage[] {
  return branches.map((branch) => {
    const tokens = extractConditionTokens(branch.conditionText);
    const matchedTokens = new Set<string>();
    const matchedTestFiles = new Set<string>();

    for (const [file, record] of testFiles.entries()) {
      const testTokens = typeof record === "string" ? collectTestTokens(record) : record.tokens;
      for (const token of tokens) {
        if (testTokens.has(token)) {
          matchedTokens.add(token);
          matchedTestFiles.add(file);
        }
      }
    }

    return {
      ...branch,
      covered: matchedTokens.size > 0,
      matchedTokens: [...matchedTokens],
      matchedTestFiles: [...matchedTestFiles],
      tokens
    };
  });
}
