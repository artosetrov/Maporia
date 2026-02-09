/**
 * Health Check System — Configuration & Types
 *
 * Defines modes, severity levels, check result shapes,
 * and the mapping of which check sets run in each mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthMode = "prebuild" | "runtime" | "ci" | "dev";

export type CheckSeverity = "critical" | "warning" | "info";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckResult = {
  /** Unique check identifier, e.g. "security.env-keys" */
  id: string;
  /** Human-readable name */
  name: string;
  /** How important is this */
  severity: CheckSeverity;
  /** Outcome */
  status: CheckStatus;
  /** Details */
  message: string;
  /** File where the issue was found */
  file?: string;
  /** Line number (1-based) */
  line?: number;
};

export type CheckSetId =
  | "security"
  | "data-integrity"
  | "google-maps"
  | "performance"
  | "state-logic"
  | "ui-ux"
  | "type-safety"
  | "navigation"
  | "error-handling"
  | "build-gate";

export type CheckSet = {
  id: CheckSetId;
  name: string;
  run: () => Promise<CheckResult[]>;
};

export type HealthReportStatus = "green" | "yellow" | "red";

export type HealthReport = {
  status: HealthReportStatus;
  mode: HealthMode;
  timestamp: string;
  duration: number;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
  results: CheckResult[];
};

// ---------------------------------------------------------------------------
// Mode → Check-set mapping
// ---------------------------------------------------------------------------

const MODE_CHECK_SETS: Record<HealthMode, CheckSetId[]> = {
  prebuild: [
    "security",
    "performance",
    "type-safety",
    "state-logic",
    "build-gate",
  ],
  ci: [
    "security",
    "data-integrity",
    "google-maps",
    "performance",
    "state-logic",
    "ui-ux",
    "type-safety",
    "navigation",
    "error-handling",
    "build-gate",
  ],
  dev: [
    "security",
    "data-integrity",
    "google-maps",
    "performance",
    "state-logic",
    "ui-ux",
    "type-safety",
    "navigation",
    "error-handling",
    "build-gate",
  ],
  runtime: ["data-integrity", "google-maps"],
};

/**
 * In dev mode, warnings do NOT block (exit 0).
 * In prebuild / ci, critical failures block (exit 1).
 */
export const BLOCK_ON_FAILURE: Record<HealthMode, boolean> = {
  prebuild: true,
  ci: true,
  dev: false,
  runtime: false,
};

export const getCheckSetsForMode = (mode: HealthMode): CheckSetId[] =>
  MODE_CHECK_SETS[mode];

// ---------------------------------------------------------------------------
// Project paths (relative to repo root)
// ---------------------------------------------------------------------------

export const PROJECT_ROOT = process.cwd();
export const APP_DIR = "app";
export const API_DIR = "app/api";
export const ADMIN_API_DIR = "app/api/admin";
export const COMPONENTS_DIR = "app/components";
export const LIB_DIR = "app/lib";
export const HOOKS_DIR = "app/hooks";
export const ENV_EXAMPLE = ".env.example";
export const TSCONFIG = "tsconfig.json";
export const NEXT_CONFIG = "next.config.ts";
