# Cursor Task: Map UI/UX Fixes

## Overview
Implement UX/UI improvements for Google Map place cards and mobile bottom navigation in Maporia (Next.js + Tailwind + Supabase).

## Tasks

### 1. Google Map Place Card — Add Premium Badge

**Requirement:**
- Show a "Premium" indicator/badge on the Google Map place preview card when `place.is_premium === true` (or equivalent premium field).
- Badge should be positioned on top of the image (top-left corner).
- Badge must match Maporia brand style:
  - Soft pill shape (rounded-full)
  - Subtle star icon
  - Use brand colors (Premium badge style from brand guide)

**Implementation:**
- Locate the Google Map place card component (likely in `/app/map/page.tsx` or similar)
- Add Premium badge component (reuse existing `PremiumBadge` component if available)
- Position badge absolutely over the cover image (top-left)
- Check premium status from place data (`is_premium`, `access_level === 'premium'`, or `premium_only`)

**Files to modify:**
- Map page component (place card rendering)
- Possibly `PremiumBadge` component if it needs updates

---

### 2. Google Map Place Card — Remove Close (X) Button

**Requirement:**
- Remove the X/close icon button from the map place card UI.
- Card must close ONLY by:
  - Tapping/clicking outside the card (backdrop/overlay)
  - NOT via an explicit close button

**Implementation:**
- Find the close button in the map place card component
- Remove the close button element
- Ensure backdrop click handler is properly implemented
- Test that clicking outside closes the card correctly

**Files to modify:**
- Map page component (place card UI)

---

### 3. Map Place Card — Favorite Icon Always Visible

**Requirement:**
- Ensure the "Add to saved / Favorite" icon is ALWAYS visible on the map place card (not only on hover).
- Both mobile and desktop: icon stays visible with correct active state:
  - Inactive: outlined icon (muted color)
  - Active: filled icon (brand green)

**Implementation:**
- Locate the favorite icon in the map place card
- Remove hover-only visibility (if using `group-hover:` or similar)
- Ensure icon is always visible with proper styling
- Verify active/inactive states work correctly
- Test on both mobile and desktop

**Files to modify:**
- Map page component (place card favorite button)

---

### 4. Mobile Bottom Navigation — Hide on Scroll Down, Show on Scroll Up

**Requirement:**
- Implement scroll-based visibility behavior on mobile only:
  - When user scrolls DOWN: bottom nav hides (slides down/out)
  - When user scrolls UP: bottom nav shows again
- Must not flicker; add a small threshold (e.g., 10–20px) and use debounce/raf
- Bottom nav must remain pinned to the real bottom of the screen:
  - Avoid `100vh`; use `100dvh` / `svh` and `env(safe-area-inset-bottom)` where needed
- Ensure it works in Mobile Chrome and Safari and doesn't "float" when browser UI collapses

**Implementation:**
- Modify `BottomNav` component (`/app/components/BottomNav.tsx`)
- Add scroll detection logic:
  - Track scroll direction (up/down)
  - Use `useEffect` with scroll event listener
  - Implement threshold (10–20px) to prevent flickering
  - Use `requestAnimationFrame` or debounce for performance
- Add state for visibility (`isVisible`)
- Apply CSS transitions for smooth show/hide
- Ensure viewport handling:
  - Use `100dvh` or `svh` for height calculations
  - Use `env(safe-area-inset-bottom)` for safe area padding
  - Test on Mobile Chrome (dynamic viewport) and Safari

**Files to modify:**
- `/app/components/BottomNav.tsx`

**Technical notes:**
- Use `window.scrollY` or `document.documentElement.scrollTop` to track scroll position
- Compare previous scroll position to current to determine direction
- Apply `transform: translateY(100%)` when hidden, `translateY(0)` when visible
- Add `transition-transform` for smooth animation
- Only apply on mobile (use media query or `window.innerWidth` check)

---

## Acceptance Criteria

- [ ] Premium badge appears on map card only for premium places (top-left of image)
- [ ] No close (X) button exists on map place card
- [ ] Clicking outside the card closes it correctly
- [ ] Favorite icon is always visible on the map place card (both mobile + desktop)
- [ ] Favorite icon shows correct active/inactive states
- [ ] Bottom nav hides smoothly on downward scroll (mobile only)
- [ ] Bottom nav reappears on upward scroll (mobile only)
- [ ] No jumping or floating gaps in bottom nav behavior
- [ ] Bottom nav remains pinned to real bottom using dynamic viewport units
- [ ] Works correctly in Mobile Chrome and Safari

---

## Testing Checklist

- [ ] Test premium badge on premium places
- [ ] Test that non-premium places don't show badge
- [ ] Test closing map card by clicking outside
- [ ] Verify no close button exists
- [ ] Test favorite icon visibility on mobile
- [ ] Test favorite icon visibility on desktop
- [ ] Test favorite icon active/inactive states
- [ ] Test bottom nav scroll behavior on mobile
- [ ] Test bottom nav doesn't hide/show on desktop
- [ ] Test bottom nav in Mobile Chrome (with dynamic viewport)
- [ ] Test bottom nav in Mobile Safari
- [ ] Verify no floating gaps when browser UI collapses

---

## Notes

- All changes must maintain Maporia brand consistency
- Use existing brand colors and components where possible
- Ensure accessibility (keyboard navigation, screen readers)
- Test on real mobile devices if possible
