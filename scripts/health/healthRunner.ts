/**
 * Health Check System — Runner / Orchestrator
 *
 * Loads config for the given mode, runs matching check sets in parallel,
 * collects results, and builds a HealthReport.
 */

import {
  type HealthMode,
  type HealthReport,
  type HealthReportStatus,
  type CheckResult,
  getCheckSetsForMode,
  BLOCK_ON_FAILURE,
} from "./healthConfig";
import { CHECK_SETS } from "./healthChecks";

/**
 * Main entry: run all health checks for the given mode.
 *
 * @returns HealthReport with aggregated results
 */
export const runProductHealthCheck = async (
  mode: HealthMode,
): Promise<HealthReport> => {
  const start = Date.now();
  const enabledIds = getCheckSetsForMode(mode);

  const setsToRun = CHECK_SETS.filter((s) => enabledIds.includes(s.id));

  // Run all matching check sets in parallel
  const setResults = await Promise.all(
    setsToRun.map(async (set) => {
      try {
        return await set.run();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return [
          {
            id: `${set.id}.runner-error`,
            name: `${set.name} runner error`,
            severity: "warning" as const,
            status: "fail" as const,
            message: `Check set threw an error: ${message}`,
          },
        ] satisfies CheckResult[];
      }
    }),
  );

  const results = setResults.flat();
  const duration = Date.now() - start;

  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const failures = results.filter((r) => r.status === "fail").length;

  let status: HealthReportStatus = "green";
  if (warnings > 0) status = "yellow";
  if (failures > 0) status = "red";

  return {
    status,
    mode,
    timestamp: new Date().toISOString(),
    duration,
    summary: {
      total: results.length,
      passed,
      warnings,
      failures,
    },
    results,
  };
};

/**
 * Whether to exit with code 1 for the given mode + report.
 */
export const shouldBlockBuild = (
  mode: HealthMode,
  report: HealthReport,
): boolean => {
  if (!BLOCK_ON_FAILURE[mode]) return false;
  return report.results.some(
    (r) => r.status === "fail" && r.severity === "critical",
  );
};
