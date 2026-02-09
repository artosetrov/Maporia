#!/usr/bin/env npx tsx
/**
 * Health Check System — CLI Entry Point
 *
 * Usage:
 *   npx tsx scripts/health/index.ts --mode=prebuild
 *   npx tsx scripts/health/index.ts --mode=dev
 *   npx tsx scripts/health/index.ts --mode=ci
 *   npx tsx scripts/health/index.ts --mode=ci --json
 */

import type { HealthMode } from "./healthConfig";
import { runProductHealthCheck, shouldBlockBuild } from "./healthRunner";
import { printReport, writeReportJson } from "./healthReport";

const VALID_MODES: HealthMode[] = ["prebuild", "runtime", "ci", "dev"];

const parseArgs = (): { mode: HealthMode; json: boolean } => {
  const args = process.argv.slice(2);
  let mode: HealthMode = "dev";
  let json = false;

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const val = arg.split("=")[1] as HealthMode;
      if (VALID_MODES.includes(val)) {
        mode = val;
      } else {
        console.error(`Unknown mode: ${val}. Valid: ${VALID_MODES.join(", ")}`);
        process.exit(1);
      }
    }
    if (arg === "--json") {
      json = true;
    }
  }

  return { mode, json };
};

const main = async (): Promise<void> => {
  const { mode, json } = parseArgs();

  const report = await runProductHealthCheck(mode);

  // Console output
  printReport(report);

  // Optional JSON output
  if (json) {
    const filePath = writeReportJson(report);
    console.log(`Report written to: ${filePath}`);
  }

  // Exit code
  if (shouldBlockBuild(mode, report)) {
    console.error(
      "\n\x1b[31m\x1b[1mBuild blocked: critical health check failures detected.\x1b[0m\n" +
      "Fix the issues above and re-run.\n",
    );
    process.exit(1);
  }

  process.exit(0);
};

main().catch((err) => {
  console.error("Health check runner failed:", err);
  process.exit(2);
});
