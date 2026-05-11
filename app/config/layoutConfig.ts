/**
 * Responsive layout constants - Mobile and Desktop only
 * Breakpoint: 1024px (lg in Tailwind)
 * - Mobile: < 1024px
 * - Desktop: >= 1024px
 */

export const LAYOUT_BREAKPOINTS = {
  mobile: 0,
  desktop: 1024, // lg breakpoint in Tailwind
} as const;

export const LAYOUT_CONFIG = {
  // Desktop (>= 1024px)
  desktop: {
    containerMaxWidth: 1920,
    containerPadding: 24,
    listShare: 0.625, // 62.5% list, 37.5% map
    mapShare: 0.375,
    gridColumns: 2,
    gap: 22,
    rowGap: 24,
    cardMinWidth: 320,
    cardIdealWidth: 360,
    cardMaxWidth: 420,
    mapStickyTop: 80,
    mapBorderRadius: 16,
  },
  // Mobile (< 1024px)
  mobile: {
    listShare: 1.0,
    mapShare: 0,
    gridColumns: 1,
    gap: 16,
    rowGap: 16,
    cardFullWidth: true,
    pagePadding: 16,
    mapViewHeight: '50vh', // Map takes 50% of viewport in map view
    bottomSheetSnapPoints: [0.3, 0.6, 0.9], // 30%, 60%, 90%
  },
} as const;

/**
 * Responsive layout breakpoints table - Mobile and Desktop only:
 * 
 * Breakpoint    | Columns | Card Width      | List/Map Ratio | Map Mode                    | Gap
 * --------------|---------|-----------------|----------------|-----------------------------|-----
 * < 1024px      | 1       | 100% (full)     | 100% / 0%      | Floating button → Bottom    | 16px
 * (Mobile)      |         |                 |                | sheet (50vh map + sheet)    |
 * >= 1024px     | 2       | 320-420px       | 62.5% / 37.5%  | Sticky right (top: 80px)    | 22-24px
 * (Desktop)     |         |                 |                | border-radius: 16px        |
 * 
 * Container:
 * - Desktop (>= 1024px): max-width 1920px, padding 24px
 * - Mobile (< 1024px): full width, padding 16px
 * 
 * Map sticky settings:
 * - Desktop: position sticky, top: 80px, height: calc(100vh - 96px)
 * - Border radius: 16px
 * 
 * Card image:
 * - Aspect ratio: 4:3
 * - Border radius: 18-22px (rounded-2xl)
 * - Carousel dots at bottom
 */
