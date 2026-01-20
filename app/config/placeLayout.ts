/**
 * Airbnb-like responsive layout constants for Place detail page
 * Breakpoints: 600 / 900 / 1120 / 1440
 */

export const PLACE_LAYOUT_BREAKPOINTS = {
  mobile: 600,
  tablet: 900,
  desktop: 1120,
  desktopXL: 1440,
} as const;

export const PLACE_LAYOUT_CONFIG = {
  // Desktop XL (>= 1440px)
  desktopXL: {
    containerMaxWidth: 1280,
    containerPadding: 24,
    galleryHeroWidth: 0.66, // 66% hero, 34% right column
    galleryGap: 12,
    galleryRadius: 16,
    contentShare: 0.6, // 60% content, 40% booking
    bookingCardMaxWidth: 420,
    bookingStickyTop: 96,
    bookingRadius: 16,
  },
  // Desktop (>= 1120px and < 1440px)
  desktop: {
    containerMaxWidth: 1120,
    containerPadding: 24,
    galleryHeroWidth: 0.6, // 60% hero, 40% right column
    galleryGap: 10,
    galleryRadius: 16,
    contentShare: 0.64, // 64% content, 36% booking
    bookingCardMaxWidth: 400,
    bookingStickyTop: 96,
    bookingRadius: 16,
  },
  // Tablet / Small desktop (>= 900px and < 1120px)
  tabletLarge: {
    containerMaxWidth: '100%',
    containerPadding: 24,
    galleryHeroWidth: 0.6,
    galleryGap: 8,
    galleryRadius: 16,
    contentShare: 1.0, // 100% content, booking below
    bookingCardMaxWidth: 720,
    bookingStickyTop: 0, // Not sticky
    bookingRadius: 16,
  },
  // Tablet (>= 600px and < 900px)
  tablet: {
    containerMaxWidth: '100%',
    containerPadding: 20,
    galleryHeroWidth: 0.65,
    galleryGap: 8,
    galleryRadius: 12,
    contentShare: 1.0,
    bookingCardMaxWidth: '100%',
    bookingStickyTop: 0,
    bookingRadius: 12,
  },
  // Mobile (< 600px)
  mobile: {
    containerMaxWidth: '100%',
    containerPadding: 0, // Full bleed
    galleryHeight: '56vh', // 52-60vh
    galleryRadius: 0, // No radius on mobile
    bottomSheetRadius: 24,
    bookingBarHeight: 80,
    safeAreaPadding: true,
  },
} as const;

/**
 * Place page responsive layout breakpoints table:
 * 
 * Breakpoint    | Gallery Mode      | Main Columns | Booking Card      | Sticky
 * --------------|-------------------|--------------|-------------------|--------
 * < 600px       | Mobile Carousel   | 1 column     | Fixed bar bottom  | No
 *               | (full-bleed)      |              |                   |
 * 600-900px     | Simplified mosaic | 1 column     | Full width below  | No
 *               | or hero + scroll  |              |                   |
 * 900-1120px    | Mosaic (2-col)    | 1 column     | Centered, max 720 | No
 * 1120-1440px   | Mosaic (2-col)    | 2 columns    | Sticky right 36%  | Yes (96px)
 * >= 1440px     | Mosaic (2-col)    | 2 columns    | Sticky right 40%  | Yes (96px)
 * 
 * Container:
 * - Desktop XL: max-width 1280px, padding 24px
 * - Desktop: max-width 1120px, padding 24px
 * - Tablet Large: 100% width, padding 24px
 * - Tablet: 100% width, padding 20px
 * - Mobile: 100% width, no padding (full-bleed)
 * 
 * Gallery:
 * - Desktop: 2-column mosaic (hero 60-66% + 4 tiles 34-40%)
 * - Mobile: Full-bleed carousel, height 56vh
 * 
 * Booking Card:
 * - Desktop: Sticky right, max-width 380-420px
 * - Tablet/Mobile: Below content, full width or max 720px centered
 */
