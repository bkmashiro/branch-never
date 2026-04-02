import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

export type PatternType = "env" | "retry" | "error" | "feature";

export interface BranchMatch {
  file: string;
  line: number;
  conditionText: string;
  pattern: PatternType;
  kind: "if" | "catch" | "ternary" | "short-circuit";
}

interface PatternDescriptor {
  type: PatternType;
  regexes: RegExp[];
}

const PATTERN_DESCRIPTORS: PatternDescriptor[] = [
  {
    type: "env",
    regexes: [
      /process\.env\.\w+/,
      /\bNODE_ENV\s*===?\s*['"`]\w+['"`]/,
      /\b(?:config|cfg)\.\w+/i
    ]
  },
  {
    type: "retry",
    regexes: [
      /\bretries?\s*[><=!]/i,
      /\battempts?\s*[><=!]/i,
      /\btimeout\b/i
    ]
  },
  {
    type: "error",
    regexes: [
      /\berr(?:or)?\.(?:code|status|type)\s*[=!]/i,
      /\be\.(?:code|status|type)\s*[=!]/i
    ]
  },
  {
    type: "feature",
    regexes: [
      /\bfeature\s*\.\s*\w+/i
    ]
  }
];

const FILE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs}";

export function extractInterestingBranches(code: string, file = "<memory>"): BranchMatch[] {
  const branches: BranchMatch[] = [];
  const seen = new Set<string>();

  const addBranch = (conditionText: string, index: number, kind: BranchMatch["kind"]) => {
    const normalized = normalizeCondition(conditionText);
    const pattern = detectPattern(normalized, kind);
    if (!pattern) {
      return;
    }

    const line = indexToLine(code, index);
    const key = `${line}:${kind}:${normalized}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    branches.push({
      file,
      line,
      conditionText: normalized,
      pattern,
      kind
    });
  };

  for (const match of code.matchAll(/\bif\s*\(([\s\S]*?)\)/g)) {
    addBranch(match[1] ?? "", match.index ?? 0, "if");
  }

  for (const match of code.matchAll(/\bcatch\s*\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/g)) {
    const errorName = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    if (errorName) {
      for (const nested of body.matchAll(
        new RegExp(`\\b${escapeRegExp(errorName)}\\.(?:code|status|type)\\s*[=!]==?\\s*([\\w"'"\`.-]+)`, "g")
      )) {
        addBranch(nested[0] ?? "", (match.index ?? 0) + (nested.index ?? 0), "catch");
      }
    }
  }

  for (const match of code.matchAll(/([^\n;]+?)\?([^\n;]+?):([^\n;]+?)(?=[;\n])/g)) {
    addBranch(match[1] ?? "", match.index ?? 0, "ternary");
  }

  for (const match of code.matchAll(/([^\n;]+?(?:&&|\|\|)[^\n;]+)(?=[;\n])/g)) {
    const expression = normalizeCondition(match[1] ?? "");
    if (/(process\.env\.|NODE_ENV|config\.|cfg\.)/i.test(expression)) {
      addBranch(expression, match.index ?? 0, "short-circuit");
    }
  }

  return branches.sort((left, right) => left.line - right.line);
}

export async function extractBranchesFromDirectory(
  srcDir: string,
  patternType: PatternType | "all" = "all",
  cwd = process.cwd()
): Promise<BranchMatch[]> {
  const absoluteDir = path.resolve(cwd, srcDir);
  const files = await glob(FILE_GLOB, {
    absolute: true,
    cwd: absoluteDir,
    nodir: true,
    ignore: ["**/*.d.ts"]
  });

  const branches = await Promise.all(
    files.map(async (file) => {
      const code = await readFile(file, "utf8");
      return extractInterestingBranches(code, path.relative(cwd, file));
    })
  );

  return branches
    .flat()
    .filter((branch) => patternType === "all" || branch.pattern === patternType)
    .sort((left, right) => {
      if (left.file === right.file) {
        return left.line - right.line;
      }
      return left.file.localeCompare(right.file);
    });
}

export function detectPattern(
  conditionText: string,
  kind?: BranchMatch["kind"]
): PatternType | null {
  for (const descriptor of PATTERN_DESCRIPTORS) {
    if (descriptor.regexes.some((regex) => regex.test(conditionText))) {
      return descriptor.type;
    }
  }

  if (kind === "short-circuit" && /(process\.env\.|NODE_ENV|config\.|cfg\.)/i.test(conditionText)) {
    return "env";
  }

  return null;
}

export function normalizeCondition(conditionText: string): string {
  return conditionText.replace(/\s+/g, " ").trim();
}

function indexToLine(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
