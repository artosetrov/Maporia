#!/usr/bin/env npx tsx

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Check = {
  name: string;
  ok: boolean;
  details?: string;
};

const root = process.cwd();

const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
  "docs/wiki/00-llm-brief.md",
  "docs/wiki/README.md",
  "docs/wiki/01-product-audit.md",
  "docs/wiki/02-feature-map.md",
  "docs/wiki/03-architecture.md",
  "docs/wiki/04-operations-and-risks.md",
  "docs/wiki/05-search-index.md",
  "app/lib/plans.ts",
  "app/lib/access.ts",
  "app/types.ts",
  "app/types/supabase.ts",
  "scripts/health/healthChecks.ts",
];

const docsToScan = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
  "docs/wiki/00-llm-brief.md",
  "docs/wiki/README.md",
  "docs/wiki/01-product-audit.md",
  "docs/wiki/02-feature-map.md",
  "docs/wiki/03-architecture.md",
  "docs/wiki/04-operations-and-risks.md",
  "docs/wiki/05-search-index.md",
];

const resolveRepoPath = (repoPath: string): string => path.join(root, repoPath);

const fileExists = (repoPath: string): boolean => existsSync(resolveRepoPath(repoPath));

const extractMarkdownLinks = (content: string): string[] => {
  const links: string[] = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
};

const isExternalOrAnchor = (href: string): boolean =>
  href.startsWith("http://") ||
  href.startsWith("https://") ||
  href.startsWith("mailto:") ||
  href.startsWith("#");

const stripAnchor = (href: string): string => href.split("#")[0] ?? href;

const checkMarkdownLinks = (repoPath: string): Check[] => {
  const absolutePath = resolveRepoPath(repoPath);
  const content = readFileSync(absolutePath, "utf8");
  const links = extractMarkdownLinks(content);
  const baseDir = path.dirname(absolutePath);

  return links
    .filter((href) => !isExternalOrAnchor(href))
    .map((href) => {
      const target = stripAnchor(href);
      if (!target) {
        return { name: `${repoPath} -> ${href}`, ok: true };
      }

      const absoluteTarget = path.resolve(baseDir, target);
      const relativeTarget = path.relative(root, absoluteTarget);

      return {
        name: `${repoPath} -> ${href}`,
        ok: existsSync(absoluteTarget),
        details: relativeTarget,
      };
    });
};

const requiredChecks: Check[] = requiredFiles.map((repoPath) => ({
  name: `required file: ${repoPath}`,
  ok: fileExists(repoPath),
}));

const linkChecks: Check[] = docsToScan
  .filter(fileExists)
  .flatMap((repoPath) => checkMarkdownLinks(repoPath));

const checks = [...requiredChecks, ...linkChecks];
const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  const marker = check.ok ? "PASS" : "FAIL";
  const details = check.details ? ` (${check.details})` : "";
  console.log(`${marker} ${check.name}${details}`);
}

if (failed.length > 0) {
  console.error(`\nWiki freshness check failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log(`\nWiki freshness check passed: ${checks.length} checks.`);
