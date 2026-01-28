"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Hook to track BottomNav visibility on mobile
 * Returns whether the bottom nav is currently visible
 */
export function useBottomNavVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollByTarget = useRef<WeakMap<EventTarget, number>>(new WeakMap());
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    // Only apply on mobile (screen width < 1024px)
    if (typeof window === "undefined" || window.innerWidth >= 1024) {
      return;
    }

    const getScrollTopForTarget = (target: EventTarget | null): number => {
      // Window/document scroll
      if (
        target === null ||
        target === window ||
        target === document ||
        target === document.documentElement ||
        target === document.body
      ) {
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      }

      // Element scroll
      if (target instanceof HTMLElement) {
        return target.scrollTop || 0;
      }

      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const handleScroll = (e: Event) => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }

      rafId.current = requestAnimationFrame(() => {
        const target = (e.target ?? document) as EventTarget;
        const currentScrollTop = getScrollTopForTarget(target);

        const last = lastScrollByTarget.current.get(target) ?? currentScrollTop;
        const diff = Math.abs(currentScrollTop - last);
        const threshold = 10; // Minimum scroll distance to trigger hide/show

        if (diff > threshold) {
          if (currentScrollTop > last && currentScrollTop > 50) {
            setIsVisible(false);
          } else if (currentScrollTop < last) {
            setIsVisible(true);
          }
          lastScrollByTarget.current.set(target, currentScrollTop);
        }
      });
    };

    // Initialize baseline for window/document scroll
    lastScrollByTarget.current.set(document, getScrollTopForTarget(document));

    // Add listeners to common scroll containers
    const attachToScrollable = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(".overflow-y-auto, .overflow-y-scroll, .scrollbar-hide")
      );
      candidates.forEach((el) => {
        if (!lastScrollByTarget.current.has(el) && el.scrollHeight > el.clientHeight) {
          lastScrollByTarget.current.set(el, getScrollTopForTarget(el));
          el.addEventListener("scroll", handleScroll, { passive: true });
        }
      });
      return candidates;
    };

    const scrollableElements = attachToScrollable();

    // Use capture to catch scroll events from nested scroll containers
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true });

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("scroll", handleScroll, true);
      
      scrollableElements.forEach((el) => {
        el.removeEventListener("scroll", handleScroll);
      });

      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []);

  return isVisible;
}
