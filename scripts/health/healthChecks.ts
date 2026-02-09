/**
 * Health Check System — All 10 Check Sets
 *
 * Each check set is an async function returning CheckResult[].
 * Checks scan files via regex / fs — no code is modified.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import fg from "fast-glob";
import {
  type CheckResult,
  type CheckSet,
  PROJECT_ROOT,
  APP_DIR,
  API_DIR,
  ADMIN_API_DIR,
  COMPONENTS_DIR,
  LIB_DIR,
  ENV_EXAMPLE,
  TSCONFIG,
  NEXT_CONFIG,
} from "./healthConfig";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolve = (...parts: string[]) => path.resolve(PROJECT_ROOT, ...parts);

const readFile = (relPath: string): string | null => {
  try {
    return fs.readFileSync(resolve(relPath), "utf-8");
  } catch {
    return null;
  }
};

const readLines = (relPath: string): string[] => {
  const content = readFile(relPath);
  return content ? content.split("\n") : [];
};

/** Glob relative to project root, returns relative paths */
const glob = (pattern: string): string[] =>
  fg.sync(pattern, { cwd: PROJECT_ROOT, dot: false });

const pass = (
  id: string,
  name: string,
  message: string,
): CheckResult => ({
  id,
  name,
  severity: "info",
  status: "pass",
  message,
});

const warn = (
  id: string,
  name: string,
  message: string,
  file?: string,
  line?: number,
): CheckResult => ({
  id,
  name,
  severity: "warning",
  status: "warn",
  message,
  file,
  line,
});

const fail = (
  id: string,
  name: string,
  message: string,
  file?: string,
  line?: number,
): CheckResult => ({
  id,
  name,
  severity: "critical",
  status: "fail",
  message,
  file,
  line,
});

/** Scan files matching glob for a regex, return matches with line info */
const scanFiles = (
  pattern: string,
  regex: RegExp,
  opts?: { exclude?: RegExp },
): Array<{ file: string; line: number; match: string }> => {
  const results: Array<{ file: string; line: number; match: string }> = [];
  const files = glob(pattern);
  for (const file of files) {
    if (opts?.exclude?.test(file)) continue;
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push({ file, line: i + 1, match: lines[i].trim() });
      }
    }
  }
  return results;
};

// ===================================================================
// 1. SECURITY CHECK SET
// ===================================================================

const securityChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "security";

  // 1a. No real keys in .env.example
  const envExample = readFile(ENV_EXAMPLE);
  if (!envExample) {
    results.push(warn(`${SET}.env-example-missing`, "Env example", ".env.example file not found"));
  } else {
    const keyPatterns = [
      /sk_live_[A-Za-z0-9]{20,}/,
      /sk_test_[A-Za-z0-9]{20,}/,
      /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/,
      /supabase_service_role_key\s*=\s*eyJ/i,
      /AIza[A-Za-z0-9_-]{30,}/,
      /sk-[A-Za-z0-9]{40,}/,
    ];
    const envLines = envExample.split("\n");
    for (let i = 0; i < envLines.length; i++) {
      for (const pat of keyPatterns) {
        if (pat.test(envLines[i])) {
          results.push(
            fail(
              `${SET}.env-real-key`,
              "Real key in .env.example",
              `Possible real API key detected: ${envLines[i].substring(0, 40)}...`,
              ENV_EXAMPLE,
              i + 1,
            ),
          );
        }
      }
    }
    if (!results.some((r) => r.id === `${SET}.env-real-key`)) {
      results.push(pass(`${SET}.env-keys-clean`, "Env example clean", "No real keys detected in .env.example"));
    }
  }

  // 1b. No anon key used directly in admin routes
  const adminFiles = glob(`${ADMIN_API_DIR}/**/*.ts`);
  for (const file of adminFiles) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
        !lines[i].includes("//") &&
        !lines[i].includes("SERVICE_ROLE")
      ) {
        results.push(
          fail(
            `${SET}.anon-key-admin`,
            "Anon key in admin route",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY used in admin route — use SERVICE_ROLE_KEY instead",
            file,
            i + 1,
          ),
        );
      }
    }
  }
  if (!results.some((r) => r.id === `${SET}.anon-key-admin`)) {
    results.push(pass(`${SET}.admin-keys-ok`, "Admin keys", "No anon key leaks in admin routes"));
  }

  // 1c. Server-only keys not exposed to client
  const clientFiles = glob(`${APP_DIR}/**/*.{ts,tsx}`);
  const serverOnlyPatterns = [/SUPABASE_SERVICE_ROLE_KEY/, /OPENAI_API_KEY/];
  for (const file of clientFiles) {
    // Skip API routes and lib files — those are server-side
    if (file.startsWith(`${API_DIR}/`) || file.includes("/route.ts")) continue;
    // Skip server components that import env directly (lib/)
    if (file.startsWith(`${LIB_DIR}/`)) continue;
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("//") || lines[i].trimStart().startsWith("*")) continue;
      for (const pat of serverOnlyPatterns) {
        if (pat.test(lines[i])) {
          results.push(
            fail(
              `${SET}.server-key-client`,
              "Server key in client file",
              `${pat.source} found in client-side file`,
              file,
              i + 1,
            ),
          );
        }
      }
    }
  }
  if (!results.some((r) => r.id === `${SET}.server-key-client`)) {
    results.push(pass(`${SET}.server-keys-safe`, "Server keys isolated", "No server-only keys in client files"));
  }

  // 1d. Unsanitized .or() usage
  const orUsages = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /\.or\s*\(/, {
    exclude: /node_modules|\.d\.ts|utils\.ts|healthCheck/,
  });
  for (const usage of orUsages) {
    // Check if sanitizePostgrestValue is used in the same file
    const fileContent = readFile(usage.file) || "";
    if (!fileContent.includes("sanitizePostgrestValue")) {
      results.push(
        warn(
          `${SET}.unsanitized-or`,
          "Unsanitized .or() filter",
          `PostgREST .or() used without sanitizePostgrestValue — potential filter injection`,
          usage.file,
          usage.line,
        ),
      );
    }
  }
  if (!results.some((r) => r.id === `${SET}.unsanitized-or`)) {
    results.push(pass(`${SET}.or-sanitized`, "Filter sanitization", "All .or() usages properly sanitized"));
  }

  return results;
};

// ===================================================================
// 2. DATA INTEGRITY CHECK SET (static part)
// ===================================================================

const dataIntegrityChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "data-integrity";

  // Static: verify runtime health endpoint exists
  const healthRoute = readFile("app/api/health/route.ts");
  if (healthRoute) {
    results.push(
      pass(
        `${SET}.runtime-endpoint`,
        "Runtime health endpoint",
        "/api/health route exists for DB integrity checks",
      ),
    );
  } else {
    results.push(
      warn(
        `${SET}.runtime-endpoint-missing`,
        "Runtime health endpoint",
        "app/api/health/route.ts not found — DB integrity checks unavailable. Run via /api/health",
      ),
    );
  }

  // Check that normalizeCity helper exists and is used
  const normalizeCityUsages = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /normalizeCity/, {
    exclude: /utils\.ts|healthCheck|node_modules/,
  });
  if (normalizeCityUsages.length === 0) {
    results.push(
      warn(
        `${SET}.normalize-city-unused`,
        "City normalization",
        "normalizeCity() is defined but not used anywhere — cities may be stored inconsistently",
      ),
    );
  } else {
    results.push(
      pass(`${SET}.normalize-city`, "City normalization", `normalizeCity used in ${normalizeCityUsages.length} file(s)`),
    );
  }

  return results;
};

// ===================================================================
// 3. GOOGLE MAPS CONSISTENCY SET
// ===================================================================

const googleMapsChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "google-maps";

  // 3a. Check env example has Google Maps key placeholder
  const envExample = readFile(ENV_EXAMPLE);
  if (envExample && !envExample.includes("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY")) {
    results.push(
      warn(
        `${SET}.env-missing-key`,
        "Google Maps key in .env.example",
        "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not listed in .env.example",
      ),
    );
  } else {
    results.push(pass(`${SET}.env-key-listed`, "Google Maps key", "Google Maps API key is listed in .env.example"));
  }

  // 3b. No hardcoded API keys in Google Maps config
  const gmapsConfig = readFile("app/config/googleMaps.ts");
  if (gmapsConfig) {
    const hardcodedKeyPattern = /["']AIza[A-Za-z0-9_-]{30,}["']/;
    if (hardcodedKeyPattern.test(gmapsConfig)) {
      results.push(
        fail(
          `${SET}.hardcoded-key`,
          "Hardcoded Google Maps key",
          "Google Maps API key is hardcoded in googleMaps.ts config",
          "app/config/googleMaps.ts",
        ),
      );
    } else {
      results.push(
        pass(`${SET}.no-hardcoded-key`, "No hardcoded key", "googleMaps.ts reads key from env"),
      );
    }
  }

  // 3c. No double-encoded URLs
  const doubleEncode = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /encodeURIComponent\s*\(\s*encodeURIComponent/, {
    exclude: /node_modules|healthCheck/,
  });
  for (const hit of doubleEncode) {
    results.push(
      warn(
        `${SET}.double-encode`,
        "Double-encoded URL",
        `Double encodeURIComponent detected`,
        hit.file,
        hit.line,
      ),
    );
  }
  if (doubleEncode.length === 0) {
    results.push(pass(`${SET}.no-double-encode`, "URL encoding", "No double-encoded URLs found"));
  }

  return results;
};

// ===================================================================
// 4. PERFORMANCE REGRESSION SET
// ===================================================================

const performanceChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "performance";

  // 4a. No select("*") — overfetching
  const selectStarHits = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /\.select\s*\(\s*["']\*["']\s*\)/, {
    exclude: /node_modules|healthCheck|\.d\.ts/,
  });
  for (const hit of selectStarHits) {
    results.push(
      warn(
        `${SET}.select-star`,
        'select("*") overfetching',
        `Use explicit field list instead of select("*")`,
        hit.file,
        hit.line,
      ),
    );
  }
  if (selectStarHits.length === 0) {
    results.push(pass(`${SET}.no-select-star`, "Explicit selects", 'No select("*") found — good'));
  }

  // 4b. Inline modals — should use GlobalModals
  const inlineModalHits = scanFiles(
    `${APP_DIR}/**/*.{ts,tsx}`,
    /<(AuthModal|PremiumUpsellModal)\b/,
    { exclude: /GlobalModals\.tsx|node_modules|healthCheck/ },
  );
  for (const hit of inlineModalHits) {
    results.push(
      warn(
        `${SET}.inline-modal`,
        "Inline modal instance",
        `<${hit.match.includes("AuthModal") ? "AuthModal" : "PremiumUpsellModal"}> should be in GlobalModals.tsx, not rendered per component`,
        hit.file,
        hit.line,
      ),
    );
  }
  if (inlineModalHits.length === 0) {
    results.push(pass(`${SET}.modals-global`, "Modals centralized", "All modals rendered via GlobalModals.tsx"));
  }

  // 4c. Batch loading — files with multiple PlaceCard should use useBatchPlaceData
  const placeCardFiles = glob(`${APP_DIR}/**/*.{ts,tsx}`).filter((f) => {
    if (f.includes("node_modules") || f.includes("healthCheck")) return false;
    if (f.includes("PlaceCard.tsx")) return false; // the component itself
    const content = readFile(f) || "";
    // Files that render PlaceCard in a list/map context
    return (content.match(/<PlaceCard\b/g) || []).length >= 1 && content.includes(".map(");
  });
  for (const file of placeCardFiles) {
    const content = readFile(file) || "";
    if (!content.includes("useBatchPlaceData")) {
      results.push(
        warn(
          `${SET}.no-batch-loading`,
          "Missing batch loading",
          "File renders PlaceCard in a list but does not use useBatchPlaceData — N+1 queries possible",
          file,
        ),
      );
    }
  }
  if (!results.some((r) => r.id === `${SET}.no-batch-loading`)) {
    results.push(pass(`${SET}.batch-loading-ok`, "Batch loading", "All PlaceCard lists use useBatchPlaceData"));
  }

  return results;
};

// ===================================================================
// 5. STATE & LOGIC CONSISTENCY SET
// ===================================================================

const stateLogicChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "state-logic";

  // 5a. Public pages should filter by access_level or check premium
  const publicPages = glob(`${APP_DIR}/**/page.tsx`).filter(
    (f) => !f.includes("(auth)") && !f.includes("admin") && !f.includes("node_modules"),
  );
  for (const file of publicPages) {
    const content = readFile(file) || "";
    // If file queries places from supabase and doesn't filter access
    if (
      content.includes(".from(") &&
      content.includes("places") &&
      !content.includes("access_level") &&
      !content.includes("is_premium") &&
      !content.includes("isPlaceHidden")
    ) {
      results.push(
        warn(
          `${SET}.unfiltered-access`,
          "Unfiltered access level",
          "Public page queries places without filtering by access_level / is_premium",
          file,
        ),
      );
    }
  }
  if (!results.some((r) => r.id === `${SET}.unfiltered-access`)) {
    results.push(
      pass(`${SET}.access-filtered`, "Access filtering", "Public pages properly filter place access levels"),
    );
  }

  // 5c. Empty state handling — pages with lists should handle empty
  for (const file of publicPages) {
    const content = readFile(file) || "";
    if (content.includes(".map(") && !content.includes("length") && !content.includes("empty")) {
      results.push(
        warn(
          `${SET}.no-empty-state`,
          "Missing empty state",
          "Page renders a list via .map() but may not handle empty state",
          file,
        ),
      );
    }
  }

  return results;
};

// ===================================================================
// 6. UI / UX SANITY SET
// ===================================================================

const uiUxChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "ui-ux";

  // 6a. Duplicate modal check (same as performance 4b, but from UI perspective)
  const inlineModals = scanFiles(
    `${APP_DIR}/**/*.{ts,tsx}`,
    /<(AuthModal|PremiumUpsellModal)\b/,
    { exclude: /GlobalModals\.tsx|node_modules|healthCheck/ },
  );
  if (inlineModals.length > 0) {
    for (const hit of inlineModals) {
      results.push(
        warn(
          `${SET}.duplicate-modal`,
          "Duplicate modal instance",
          "Modal should be a single instance in GlobalModals.tsx",
          hit.file,
          hit.line,
        ),
      );
    }
  } else {
    results.push(pass(`${SET}.single-modals`, "Single modal instances", "Modals are centralized in GlobalModals.tsx"));
  }

  // 6b. Safe-area padding in layout
  const layoutContent = readFile("app/layout.tsx") || "";
  const hasSafeArea =
    layoutContent.includes("safe-area") ||
    layoutContent.includes("pb-safe") ||
    layoutContent.includes("env(safe-area") ||
    layoutContent.includes("viewport-fit=cover");
  if (!hasSafeArea) {
    results.push(
      warn(
        `${SET}.no-safe-area`,
        "Missing safe-area padding",
        "app/layout.tsx does not reference safe-area insets — bottom bar may overlap content on notched devices",
        "app/layout.tsx",
      ),
    );
  } else {
    results.push(pass(`${SET}.safe-area`, "Safe-area padding", "Layout includes safe-area inset handling"));
  }

  // 6c. Skeleton loading usage in pages
  const pageFiles = glob(`${APP_DIR}/**/page.tsx`);
  let pagesWithLoading = 0;
  let pagesWithoutSkeleton = 0;
  for (const file of pageFiles) {
    const content = readFile(file) || "";
    if (content.includes("loading") || content.includes("isLoading") || content.includes("useState")) {
      pagesWithLoading++;
      if (!content.includes("Skeleton") && !content.includes("skeleton") && !content.includes("animate-pulse")) {
        pagesWithoutSkeleton++;
        results.push(
          warn(
            `${SET}.no-skeleton`,
            "Missing skeleton loading",
            "Page has loading state but does not use Skeleton component",
            file,
          ),
        );
      }
    }
  }
  if (pagesWithoutSkeleton === 0) {
    results.push(
      pass(
        `${SET}.skeletons-ok`,
        "Skeleton loading",
        `${pagesWithLoading} page(s) with loading state all use skeletons`,
      ),
    );
  }

  return results;
};

// ===================================================================
// 7. TYPE SAFETY SET
// ===================================================================

const typeSafetyChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "type-safety";

  // 7a. strict mode in tsconfig
  const tsconfig = readFile(TSCONFIG);
  if (tsconfig) {
    try {
      // tsconfig may have comments — do a simple check
      if (tsconfig.includes('"strict"') && tsconfig.includes("true")) {
        results.push(pass(`${SET}.strict-mode`, "Strict mode", "TypeScript strict mode is enabled"));
      } else {
        results.push(
          fail(
            `${SET}.no-strict`,
            "TypeScript strict mode",
            "strict: true not found in tsconfig.json — enables implicit any and other unsafe patterns",
            TSCONFIG,
          ),
        );
      }
    } catch {
      results.push(warn(`${SET}.tsconfig-parse`, "tsconfig parse", "Could not parse tsconfig.json"));
    }
  } else {
    results.push(fail(`${SET}.tsconfig-missing`, "tsconfig.json", "tsconfig.json not found"));
  }

  // 7b. Count explicit "any" usage
  const asAnyHits = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /\bas\s+any\b/, {
    exclude: /node_modules|\.d\.ts|healthCheck/,
  });
  const colonAnyHits = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /:\s*any\b/, {
    exclude: /node_modules|\.d\.ts|healthCheck/,
  });
  const totalAny = asAnyHits.length + colonAnyHits.length;
  if (totalAny > 0) {
    results.push(
      warn(
        `${SET}.any-usage`,
        "Explicit any usage",
        `Found ${asAnyHits.length} "as any" and ${colonAnyHits.length} ": any" across app/ — consider typing properly`,
      ),
    );
    // Report top 5 worst offenders
    const allHits = [...asAnyHits, ...colonAnyHits];
    const fileCount: Record<string, number> = {};
    for (const hit of allHits) {
      fileCount[hit.file] = (fileCount[hit.file] || 0) + 1;
    }
    const sorted = Object.entries(fileCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [file, count] of sorted) {
      results.push(
        warn(
          `${SET}.any-hotspot`,
          "Any type hotspot",
          `${count} any usage(s) in file`,
          file,
        ),
      );
    }
  } else {
    results.push(pass(`${SET}.no-any`, "No explicit any", "No explicit any usage found — excellent"));
  }

  // 7c. API routes should import from shared types
  const apiRoutes = glob(`${API_DIR}/**/route.ts`);
  for (const file of apiRoutes) {
    const content = readFile(file) || "";
    // API routes that return place/collection data should reference shared types
    if (
      (content.includes("places") || content.includes("collections")) &&
      content.includes("NextResponse.json") &&
      !content.includes("@/app/types") &&
      !content.includes("../types") &&
      !content.includes("../../types") &&
      !content.includes("from \"@/app/lib/access\"")
    ) {
      results.push(
        warn(
          `${SET}.untyped-api`,
          "Untyped API response",
          "API route returns data without importing shared types",
          file,
        ),
      );
    }
  }

  return results;
};

// ===================================================================
// 8. NAVIGATION & ROUTING SET
// ===================================================================

const navigationChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "navigation";

  // 8a. Every page.tsx should export default
  const pageFiles = glob(`${APP_DIR}/**/page.tsx`);
  for (const file of pageFiles) {
    const content = readFile(file) || "";
    if (!content.includes("export default") && !content.includes("export { default")) {
      results.push(
        fail(
          `${SET}.no-default-export`,
          "Missing default export",
          "page.tsx must export a default component for Next.js routing to work",
          file,
        ),
      );
    }
  }
  if (!results.some((r) => r.id === `${SET}.no-default-export`)) {
    results.push(pass(`${SET}.all-pages-export`, "Page exports", `All ${pageFiles.length} page.tsx files export default`));
  }

  // 8b. Basic broken link check — href references to routes that don't exist
  const allContent = glob(`${APP_DIR}/**/*.{ts,tsx}`);
  const existingRoutes = new Set(
    pageFiles.map((f) => {
      // app/explore/page.tsx → /explore
      // app/(auth)/profile/page.tsx → /profile
      const rel = f
        .replace(/^app/, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/\/\([^)]+\)/g, ""); // strip route groups
      return rel || "/";
    }),
  );

  const hrefPattern = /href\s*=\s*["'`](\/[a-z][a-z0-9/\-]*)["'`]/g;
  let brokenLinks = 0;
  for (const file of allContent) {
    const content = readFile(file) || "";
    let match: RegExpExecArray | null;
    const localRegex = new RegExp(hrefPattern.source, hrefPattern.flags);
    while ((match = localRegex.exec(content)) !== null) {
      const href = match[1];
      // Skip dynamic routes, anchors, and external patterns
      if (href.includes("[") || href.includes("#") || href.includes("?")) continue;
      // Normalize: /explore/ → /explore
      const normalized = href.replace(/\/$/, "") || "/";
      if (!existingRoutes.has(normalized)) {
        // Could be a dynamic route parent — check if a parent with [param] exists
        const parentPattern = normalized.replace(/\/[^/]+$/, "/[");
        const hasDynamic = [...existingRoutes].some((r) => r.startsWith(parentPattern.slice(0, -1)));
        if (!hasDynamic) {
          results.push(
            warn(
              `${SET}.broken-link`,
              "Possible broken link",
              `href="${href}" does not match any known page route`,
              file,
            ),
          );
          brokenLinks++;
        }
      }
    }
  }
  if (brokenLinks === 0) {
    results.push(pass(`${SET}.links-valid`, "Link validity", "All internal href links match existing routes"));
  }

  return results;
};

// ===================================================================
// 9. ERROR HANDLING SET
// ===================================================================

const errorHandlingChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "error-handling";

  // 9a. Page-level files should use ErrorBoundary or SectionErrorBoundary
  const pageFiles = glob(`${APP_DIR}/**/page.tsx`).filter(
    (f) => !f.includes("node_modules") && !f.includes("healthCheck"),
  );
  for (const file of pageFiles) {
    const content = readFile(file) || "";
    if (
      !content.includes("ErrorBoundary") &&
      !content.includes("SectionErrorBoundary") &&
      content.length > 500 // skip trivial pages
    ) {
      results.push(
        warn(
          `${SET}.no-error-boundary`,
          "Missing ErrorBoundary",
          "Page does not wrap sections in ErrorBoundary — crashes will break entire page",
          file,
        ),
      );
    }
  }
  if (!results.some((r) => r.id === `${SET}.no-error-boundary`)) {
    results.push(
      pass(`${SET}.error-boundaries`, "Error boundaries", "All substantial pages use ErrorBoundary"),
    );
  }

  // 9b. logger usage — lib/ and api/ should use logger, not console.log
  const libApiFiles = [
    ...glob(`${LIB_DIR}/**/*.{ts,tsx}`),
    ...glob(`${API_DIR}/**/*.ts`),
  ].filter((f) => !f.includes("logger.ts") && !f.includes("diagnostics.ts") && !f.includes("healthCheck"));
  let rawConsoleCount = 0;
  for (const file of libApiFiles) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        (line.includes("console.log(") || line.includes("console.warn(") || line.includes("console.info(")) &&
        !line.trimStart().startsWith("//")
      ) {
        rawConsoleCount++;
      }
    }
  }
  if (rawConsoleCount > 0) {
    results.push(
      warn(
        `${SET}.raw-console`,
        "Raw console usage",
        `${rawConsoleCount} console.log/warn/info call(s) in lib/ and api/ — consider using logger.ts instead`,
      ),
    );
  } else {
    results.push(pass(`${SET}.logger-used`, "Logger usage", "lib/ and api/ files use structured logger"));
  }

  // 9c. API routes return structured error JSON
  const apiRoutes = glob(`${API_DIR}/**/route.ts`);
  for (const file of apiRoutes) {
    const content = readFile(file) || "";
    if (
      content.includes("NextResponse") &&
      content.includes("catch") &&
      !content.includes("error") &&
      !content.includes("\"error\"") &&
      !content.includes("'error'")
    ) {
      results.push(
        warn(
          `${SET}.unstructured-error`,
          "Unstructured API error",
          "API route catch block may not return structured error JSON",
          file,
        ),
      );
    }
  }

  return results;
};

// ===================================================================
// 10. BUILD & DEPLOY GATE SET
// ===================================================================

const buildGateChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  const SET = "build-gate";

  // 10a. reactStrictMode enabled
  const nextConfig = readFile(NEXT_CONFIG);
  if (nextConfig) {
    if (nextConfig.includes("reactStrictMode") && nextConfig.includes("true")) {
      results.push(pass(`${SET}.strict-mode`, "React Strict Mode", "reactStrictMode is enabled"));
    } else if (nextConfig.includes("reactStrictMode") && nextConfig.includes("false")) {
      results.push(
        fail(
          `${SET}.no-strict-mode`,
          "React Strict Mode disabled",
          "reactStrictMode is explicitly set to false in next.config.ts",
          NEXT_CONFIG,
        ),
      );
    } else {
      results.push(
        warn(
          `${SET}.strict-mode-missing`,
          "React Strict Mode",
          "reactStrictMode not found in next.config.ts — defaults depend on Next.js version",
          NEXT_CONFIG,
        ),
      );
    }
  } else {
    results.push(warn(`${SET}.no-next-config`, "next.config.ts", "next.config.ts not found"));
  }

  // 10b. Env completeness — all vars from .env.example should be documented
  const envExample = readFile(ENV_EXAMPLE);
  if (envExample) {
    const envVars = envExample
      .split("\n")
      .filter((l) => l.match(/^[A-Z_]+=/) || l.match(/^[A-Z_]+\s*=/))
      .map((l) => l.split("=")[0].trim());
    const requiredVars = envVars.filter((v) => !v.startsWith("#"));
    if (requiredVars.length > 0) {
      results.push(
        pass(
          `${SET}.env-documented`,
          "Env vars documented",
          `${requiredVars.length} environment variable(s) documented in .env.example: ${requiredVars.join(", ")}`,
        ),
      );
    }
  }

  // 10c. No critical TODO/FIXME markers
  const criticalMarkers = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /\/\/\s*(TODO|FIXME)\s*:?\s*(CRITICAL|URGENT|BLOCKER)/i, {
    exclude: /node_modules|healthCheck/,
  });
  for (const hit of criticalMarkers) {
    results.push(
      fail(
        `${SET}.critical-todo`,
        "Critical TODO/FIXME",
        `Unresolved critical marker: ${hit.match}`,
        hit.file,
        hit.line,
      ),
    );
  }
  if (criticalMarkers.length === 0) {
    results.push(pass(`${SET}.no-critical-todos`, "No critical TODOs", "No unresolved CRITICAL/URGENT/BLOCKER markers"));
  }

  // 10d. Count regular TODOs as info
  const regularTodos = scanFiles(`${APP_DIR}/**/*.{ts,tsx}`, /\/\/\s*(TODO|FIXME)\b/i, {
    exclude: /node_modules|healthCheck/,
  });
  // Subtract critical ones already counted
  const infoTodos = regularTodos.length - criticalMarkers.length;
  if (infoTodos > 0) {
    results.push(
      warn(
        `${SET}.todo-count`,
        "TODO markers",
        `${infoTodos} TODO/FIXME marker(s) found across app/ — review before release`,
      ),
    );
  }

  return results;
};

// ===================================================================
// REGISTRY — Export all check sets
// ===================================================================

export const CHECK_SETS: CheckSet[] = [
  { id: "security", name: "Security", run: securityChecks },
  { id: "data-integrity", name: "Data Integrity", run: dataIntegrityChecks },
  { id: "google-maps", name: "Google Maps Consistency", run: googleMapsChecks },
  { id: "performance", name: "Performance Regression", run: performanceChecks },
  { id: "state-logic", name: "State & Logic Consistency", run: stateLogicChecks },
  { id: "ui-ux", name: "UI/UX Sanity", run: uiUxChecks },
  { id: "type-safety", name: "Type Safety", run: typeSafetyChecks },
  { id: "navigation", name: "Navigation & Routing", run: navigationChecks },
  { id: "error-handling", name: "Error Handling", run: errorHandlingChecks },
  { id: "build-gate", name: "Build & Deploy Gate", run: buildGateChecks },
];
