import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BaselineComparison } from "./baseline.js";
import type { FormatPayload } from "./formatter.js";
import type { BranchCoverage } from "./matcher.js";

interface HtmlReportOptions {
  baselineComparison?: BaselineComparison;
  cwd?: string;
}

interface FileCoverageSummary {
  file: string;
  coveredCount: number;
  uncoveredCount: number;
  total: number;
  coveragePercent: number;
}

export async function generateHtmlReport(payload: FormatPayload, options: HtmlReportOptions = {}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const allBranches = [...payload.covered, ...payload.uncovered];
  const files = summarizeFiles(allBranches);
  const sourceSections = await Promise.all(
    files.map(async (fileSummary) => renderSourceSection(fileSummary.file, payload, cwd))
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>branch-never report</title>
  <style>
    :root {
      --bg: #f6f1e8;
      --panel: #fffdf8;
      --ink: #1f2933;
      --muted: #5b6773;
      --border: #d7cbb8;
      --covered: #1f7a4d;
      --covered-bg: #e5f6ec;
      --uncovered: #b42318;
      --uncovered-bg: #ffe5e0;
      --accent: #0f4c81;
      --code-bg: #f3ede2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: linear-gradient(180deg, #f1e7d9 0%, var(--bg) 100%);
      color: var(--ink);
      line-height: 1.5;
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 8px 30px rgba(31, 41, 51, 0.06);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th { color: var(--muted); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .metric {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      background: #fff9f0;
    }
    .metric strong {
      display: block;
      font-size: 28px;
      margin-top: 4px;
    }
    .pill {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .pill-covered { color: var(--covered); background: var(--covered-bg); }
    .pill-uncovered { color: var(--uncovered); background: var(--uncovered-bg); }
    .branches td:last-child { white-space: nowrap; }
    .code {
      background: var(--code-bg);
      border-radius: 12px;
      overflow: auto;
      border: 1px solid var(--border);
    }
    .code table { border-collapse: separate; border-spacing: 0; }
    .code td {
      border: 0;
      padding: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 13px;
    }
    .line-no {
      width: 64px;
      min-width: 64px;
      text-align: right;
      color: var(--muted);
      padding: 0 12px;
      user-select: none;
      border-right: 1px solid var(--border);
    }
    .line-code {
      white-space: pre;
      padding: 0 12px;
    }
    tr.covered { background: var(--covered-bg); }
    tr.uncovered { background: var(--uncovered-bg); }
    .empty { color: var(--muted); }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>branch-never report</h1>
      <p>Detailed branch coverage report for uncovered and covered heuristic branches.</p>
      <div class="metric-grid">
        <div class="metric"><span>Total branches</span><strong>${payload.summary.total}</strong></div>
        <div class="metric"><span>Covered</span><strong>${payload.summary.coveredCount}</strong></div>
        <div class="metric"><span>Uncovered</span><strong>${payload.summary.uncoveredCount}</strong></div>
        <div class="metric"><span>Coverage</span><strong>${payload.summary.coveragePercent}%</strong></div>
      </div>
    </section>
    ${options.baselineComparison ? renderTrendSection(options.baselineComparison) : ""}
    <section>
      <h2>Files</h2>
      <table>
        <thead>
          <tr><th>File</th><th>Coverage</th><th>Covered</th><th>Uncovered</th></tr>
        </thead>
        <tbody>
          ${files
            .map(
              (file) => `<tr>
            <td><a href="#file-${slug(file.file)}">${escapeHtml(file.file)}</a></td>
            <td>${file.coveragePercent}%</td>
            <td>${file.coveredCount}</td>
            <td>${file.uncoveredCount}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Uncovered branches</h2>
      ${
        payload.uncovered.length === 0
          ? `<p class="empty">No uncovered branches found.</p>`
          : `<table class="branches">
        <thead>
          <tr><th>Location</th><th>Condition</th><th>Pattern</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${payload.uncovered
            .map(
              (branch) => `<tr>
            <td><a href="#branch-${branchAnchor(branch)}">${escapeHtml(branch.file)}:${branch.line}</a></td>
            <td>${escapeHtml(branch.conditionText)}</td>
            <td>${escapeHtml(branch.pattern)}</td>
            <td><span class="pill pill-uncovered">uncovered</span></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`
      }
    </section>
    ${sourceSections.join("\n")}
  </main>
</body>
</html>`;
}

function summarizeFiles(branches: BranchCoverage[]): FileCoverageSummary[] {
  const grouped = new Map<string, { coveredCount: number; uncoveredCount: number }>();

  for (const branch of branches) {
    const current = grouped.get(branch.file) ?? { coveredCount: 0, uncoveredCount: 0 };
    if (branch.covered) {
      current.coveredCount += 1;
    } else {
      current.uncoveredCount += 1;
    }
    grouped.set(branch.file, current);
  }

  return [...grouped.entries()]
    .map(([file, counts]) => {
      const total = counts.coveredCount + counts.uncoveredCount;
      return {
        file,
        coveredCount: counts.coveredCount,
        uncoveredCount: counts.uncoveredCount,
        total,
        coveragePercent: total === 0 ? 100 : Math.round((counts.coveredCount / total) * 100)
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));
}

async function renderSourceSection(file: string, payload: FormatPayload, cwd: string): Promise<string> {
  const branches = [...payload.covered, ...payload.uncovered]
    .filter((branch) => branch.file === file)
    .sort((left, right) => left.line - right.line);
  const branchMap = new Map<number, BranchCoverage[]>();
  for (const branch of branches) {
    const atLine = branchMap.get(branch.line) ?? [];
    atLine.push(branch);
    branchMap.set(branch.line, atLine);
  }

  const source = await readFile(path.resolve(cwd, file), "utf8");
  const lines = source.split("\n");
  const rows = lines
    .map((line, index) => {
      const lineNumber = index + 1;
      const lineBranches = branchMap.get(lineNumber) ?? [];
      const status = lineBranches.some((branch) => !branch.covered)
        ? "uncovered"
        : lineBranches.some((branch) => branch.covered)
          ? "covered"
          : "";
      const anchors = lineBranches
        .map((branch) => `<a id="branch-${branchAnchor(branch)}"></a>`)
        .join("");

      return `<tr class="${status}">
        <td class="line-no" id="file-${slug(file)}-line-${lineNumber}">${anchors}${lineNumber}</td>
        <td class="line-code">${escapeHtml(line)}</td>
      </tr>`;
    })
    .join("");

  const branchDetails = branches
    .map(
      (branch) => `<tr>
      <td><a href="#branch-${branchAnchor(branch)}">${branch.line}</a></td>
      <td>${escapeHtml(branch.conditionText)}</td>
      <td>${escapeHtml(branch.pattern)}</td>
      <td><span class="pill ${branch.covered ? "pill-covered" : "pill-uncovered"}">${branch.covered ? "covered" : "uncovered"}</span></td>
    </tr>`
    )
    .join("");

  return `<section id="file-${slug(file)}">
    <h2>${escapeHtml(file)}</h2>
    <table class="branches">
      <thead><tr><th>Line</th><th>Condition</th><th>Pattern</th><th>Status</th></tr></thead>
      <tbody>${branchDetails}</tbody>
    </table>
    <div class="code">
      <table><tbody>${rows}</tbody></table>
    </div>
  </section>`;
}

function renderTrendSection(comparison: BaselineComparison): string {
  const tone = comparison.netChange > 0 ? "pill-covered" : comparison.netChange < 0 ? "pill-uncovered" : "";
  const label = comparison.netChange > 0 ? "improvement" : comparison.netChange < 0 ? "regression" : "no change";

  return `<section>
    <h2>Trend</h2>
    <p>Comparing branch coverage: ${escapeHtml(comparison.baselineRef)} &rarr; HEAD</p>
    <div class="metric-grid">
      <div class="metric"><span>Newly uncovered</span><strong>${comparison.newlyUncovered.length}</strong></div>
      <div class="metric"><span>Newly covered</span><strong>${comparison.newlyCovered.length}</strong></div>
      <div class="metric"><span>Net</span><strong><span class="pill ${tone}">${comparison.netChange > 0 ? "+" : ""}${comparison.netChange}</span></strong></div>
    </div>
    <p>${escapeHtml(label)}</p>
  </section>`;
}

function branchAnchor(branch: BranchCoverage): string {
  return slug(`${branch.file}-${branch.line}-${branch.pattern}-${branch.kind}-${branch.conditionText}`);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
