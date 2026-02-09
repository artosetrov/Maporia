/**
 * Simple logger utility that suppresses debug/info/warn in production.
 * Only errors are always visible.
 *
 * Usage:
 *   import { logger } from "@/app/lib/logger";
 *   logger.debug("[Module]", "message", { data });
 *   logger.warn("[Module]", "message");
 *   logger.error("[Module]", "message", error);
 */

const isDev = process.env.NODE_ENV === "development";

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
