"use client";

import { useSyncExternalStore } from "react";
import { LAYOUT_BREAKPOINTS } from "../config/layoutConfig";

const query = `(min-width: ${LAYOUT_BREAKPOINTS.desktop}px)`;

const subscribe = (callback: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
};

const getSnapshot = () => window.matchMedia(query).matches;

const getServerSnapshot = () => false;

/**
 * Возвращает true при ширине экрана >= desktop breakpoint (1024px).
 * Используется для поведения «открывать в новой вкладке на десктопе».
 */
export const useIsDesktop = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
