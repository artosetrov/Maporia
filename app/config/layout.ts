/**
 * Airbnb-like responsive layout constants
 * Breakpoints: 600 / 900 / 1120 / 1440
 */

export const LAYOUT_BREAKPOINTS = {
  mobile: 600,
  tablet: 900,
  desktop: 1120,
  desktopXL: 1440,
} as const;

export const LAYOUT_CONFIG = {
  // Desktop XL (>= 1440px)
  desktopXL: {
    containerMaxWidth: 1920,
    containerPadding: 24,
    listShare: 0.6, // 60% list, 40% map
    mapShare: 0.4,
    gridColumns: 3,
    gap: 24,
    rowGap: 28,
    cardMinWidth: 320,
    cardIdealWidth: 360,
    cardMaxWidth: 420,
    mapStickyTop: 80,
    mapBorderRadius: 16,
  },
  // Desktop (>= 1120px and < 1440px)
  desktop: {
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
  // Tablet / Small desktop (>= 900px and < 1120px)
  tabletLarge: {
    listShare: 1.0, // 100% list, map hidden
    mapShare: 0,
    gridColumns: 2,
    gap: 18,
    rowGap: 20,
    cardMinWidth: 300,
    cardIdealWidth: 340,
    cardMaxWidth: 420,
  },
  // Tablet (>= 600px and < 900px)
  tablet: {
    listShare: 1.0,
    mapShare: 0,
    gridColumns: 1, // Can be 2 near 900px, but default 1
    gap: 16,
    rowGap: 16,
    cardMinWidth: 300,
    cardMaxWidth: 680,
    cardCentered: true,
  },
  // Mobile (< 600px)
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
 * Airbnb-like responsive layout breakpoints table:
 * 
 * Breakpoint    | Columns | Card Width      | List/Map Ratio | Map Mode                    | Gap
 * --------------|---------|-----------------|----------------|-----------------------------|-----
 * < 600px       | 1       | 100% (full)     | 100% / 0%      | Floating button → Bottom    | 16px
 *               |         |                 |                | sheet (50vh map + sheet)    |
 * 600-900px     | 1       | 100% (max 680)  | 100% / 0%      | Hidden (button "Map")       | 16px
 *               |         | centered        |                |                             |
 * 900-1120px    | 2       | 300-420px       | 100% / 0%      | Hidden (button "Show map")  | 18-20px
 * 1120-1440px   | 2       | 320-420px       | 62.5% / 37.5%  | Sticky right (top: 80px)    | 22-24px
 * 1440-1919px   | 3       | 320-420px       | 60% / 40%      | Sticky right (top: 80px)    | 24px
 *               |         |                 |                | border-radius: 16px         | row: 28px
 * >= 1920px     | 3       | 320-420px       | Fixed/Stretch  | Sticky right, 100% width    | 24px
 *               |         |                 | List: max 1152px| Map: flex-1 (stretches)     | row: 28px
 * 
 * Container:
 * - Desktop XL (1440-1919px): max-width 1920px, padding 24px
 * - Desktop (1120-1439px): max-width 1920px, padding 24px
 * - Very Large (>=1920px): no max-width, full width, padding 24px
 * - Tablet/Mobile: full width, padding 16-20px
 * 
 * Map sticky settings:
 * - Desktop: position sticky, top: 80px, height: calc(100vh - 96px)
 * - Border radius: 16px
 * - On >=1920px: map stretches to 100% of remaining horizontal space
 * 
 * Card image:
 * - Aspect ratio: 4:3
 * - Border radius: 18-22px (rounded-2xl)
 * - Carousel dots at bottom
 */
