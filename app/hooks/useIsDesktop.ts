"use client";

import { useState, useEffect } from "react";
import { LAYOUT_BREAKPOINTS } from "../config/layout";

/**
 * Возвращает true при ширине экрана >= desktop breakpoint (1024px).
 * Используется для поведения «открывать в новой вкладке на десктопе».
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LAYOUT_BREAKPOINTS.desktop}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
