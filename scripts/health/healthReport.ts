/**
 * Health Check System — Report Formatter
 *
 * Formats a HealthReport for console output (ANSI colors)
 * and optionally writes a health-report.json file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { HealthReport, CheckResult } from "./healthConfig";

// ---------------------------------------------------------------------------
// ANSI helpers (no chalk dependency needed)
// ---------------------------------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";

const statusIcon = (status: CheckResult["status"]): string => {
  switch (status) {
    case "pass":
      return `${GREEN}✓${RESET}`;
    case "warn":
      return `${YELLOW}⚠${RESET}`;
    case "fail":
      return `${RED}✗${RESET}`;
  }
};

const statusColor = (status: CheckResult["status"]): string => {
  switch (status) {
    case "pass":
      return GREEN;
    case "warn":
      return YELLOW;
    case "fail":
      return RED;
  }
};

const reportStatusBanner = (status: HealthReport["status"]): string => {
  switch (status) {
    case "green":
      return `${GREEN}${BOLD}  STATUS: GREEN — All checks passed  ${RESET}`;
    case "yellow":
      return `${YELLOW}${BOLD}  STATUS: YELLOW — Warnings detected  ${RESET}`;
    case "red":
      return `${RED}${BOLD}  STATUS: RED — Critical failures found  ${RESET}`;
  }
};

// ---------------------------------------------------------------------------
// Console formatter
// ---------------------------------------------------------------------------

export const printReport = (report: HealthReport): void => {
  const { summary, results, mode, duration, timestamp } = report;

  console.log("");
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     MAPORIA PRODUCT HEALTH CHECK        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}`);
  console.log("");
  console.log(`  Mode:      ${BOLD}${mode}${RESET}`);
  console.log(`  Time:      ${DIM}${timestamp}${RESET}`);
  console.log(`  Duration:  ${DIM}${duration}ms${RESET}`);
  console.log("");
  console.log(reportStatusBanner(report.status));
  console.log("");
  console.log(
    `  ${GREEN}${summary.passed} passed${RESET}  ` +
    `${YELLOW}${summary.warnings} warning(s)${RESET}  ` +
    `${RED}${summary.failures} failure(s)${RESET}  ` +
    `${DIM}${summary.total} total${RESET}`,
  );
  console.log("");

  // Group results by check set (derive from id prefix)
  const grouped = new Map<string, CheckResult[]>();
  for (const r of results) {
    const group = r.id.split(".")[0];
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(r);
  }

  for (const [group, items] of grouped) {
    const hasIssues = items.some((r) => r.status !== "pass");
    console.log(`${BOLD}${WHITE}  [${group}]${RESET}${hasIssues ? "" : ` ${GREEN}all clear${RESET}`}`);

    for (const r of items) {
      const icon = statusIcon(r.status);
      const color = statusColor(r.status);
      const location = r.file
        ? `${DIM}${r.file}${r.line ? `:${r.line}` : ""}${RESET} `
        : "";
      console.log(`    ${icon} ${color}${r.name}${RESET} — ${r.message}`);
      if (location) {
        console.log(`      ${location}`);
      }
    }
    console.log("");
  }

  // Failures summary
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    console.log(`${RED}${BOLD}  ── Critical Failures (must fix) ──${RESET}`);
    for (const f of failures) {
      console.log(`    ${RED}✗${RESET} ${f.name}: ${f.message}`);
      if (f.file) console.log(`      ${DIM}→ ${f.file}${f.line ? `:${f.line}` : ""}${RESET}`);
    }
    console.log("");
  }

  // Warnings summary
  const warnings = results.filter((r) => r.status === "warn");
  if (warnings.length > 0) {
    console.log(`${YELLOW}${BOLD}  ── Warnings (review recommended) ──${RESET}`);
    for (const w of warnings) {
      console.log(`    ${YELLOW}⚠${RESET} ${w.name}: ${w.message}`);
      if (w.file) console.log(`      ${DIM}→ ${w.file}${w.line ? `:${w.line}` : ""}${RESET}`);
    }
    console.log("");
  }

  console.log(`${DIM}─────────────────────────────────────────────${RESET}`);
  console.log("");
};

// ---------------------------------------------------------------------------
// JSON file output
// ---------------------------------------------------------------------------

export const writeReportJson = (
  report: HealthReport,
  outputDir: string = process.cwd(),
): string => {
  const filePath = path.join(outputDir, "health-report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
};
