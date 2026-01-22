# Maporia® Brand Guide — Wordmark

## Wordmark — Maporia®

### Typeface
- **Font:** Manrope
- **Weight:** SemiBold (600)
- **Case:** Title Case — `Maporia`
- **Letter-spacing:** -0.02em
- **Effects:** none (no shadows, strokes, gradients)

### Color
- **Primary:** Maporia Brand Green (`#8F9E4F`)
- **Inverted:** White (on brand green background)

### ® Usage
- Use the **® symbol only in marketing and brand contexts**
  - Website
  - Brand pages
  - Press / presentations
- **Do NOT use ® in product UI or mobile app**
- **Size:** ~60% of the wordmark x-height
- **Position:** top-right of the wordmark with small optical offset

### Usage Rules
- Default wordmark: **Maporia®** (in marketing contexts)
- Default wordmark: **Maporia** (in product UI)
- Small sizes (<120px width): use **icon-only**
- Do not modify spacing, weight, or proportions
- Do not use all caps

### CSS Reference
```css
.wordmark {
  font-family: 'Manrope', Inter, system-ui, sans-serif;
  font-weight: 600;
  letter-spacing: -0.02em;
}
```

---

## Icon + Wordmark Lockup

### Desktop / Marketing Contexts
- **Use:** Icon + Wordmark together
- **Spacing:** 8px gap between icon and wordmark
- **Alignment:** Vertically centered
- **Usage:**
  - Desktop header/navigation
  - Marketing pages
  - Landing pages
  - Email headers
  - Press materials

### Mobile / Product UI
- **Use:** Icon-only (for space constraints)
- **Threshold:** <120px width → icon-only
- **Usage:**
  - Mobile navigation
  - App headers
  - Compact UI elements
  - Small badges

### Lockup Specifications
```
[Icon] [8px gap] Maporia
```
- Icon size: 20px (default), 24px (large), 16px (small)
- Wordmark size: 18px (default), 20px (large), 16px (small)
- Vertical alignment: center

---

## Mobile vs Desktop Rules

### Desktop (≥900px)
- **Default:** Icon + Wordmark lockup
- **Show ®:** Only in marketing contexts (not product UI)
- **Size:** Default or large
- **Placement:** Left side of header/navigation

### Mobile (<900px)
- **Default:** Icon-only
- **Show ®:** Never (product UI)
- **Size:** Small or default
- **Placement:** Left side of header, or center if no search bar

### Tablet (600px - 899px)
- **Default:** Icon-only or Icon + Wordmark (context-dependent)
- **Show ®:** Only in marketing contexts
- **Size:** Default
- **Placement:** Left side of header

---

## App Icon / Favicon Rules

### App Icon (Mobile App)
- **Format:** PNG with transparency
- **Sizes:** 
  - iOS: 1024×1024 (App Store), 180×180 (iPhone), 167×167 (iPad Pro)
  - Android: 512×512 (Play Store), 192×192 (launcher)
- **Design:** Icon only (pin icon)
- **Background:** Transparent or brand green (#8F9E4F)
- **Do NOT include:** Wordmark or ® symbol

### Favicon (Web)
- **Format:** ICO, PNG, or SVG
- **Sizes:** 16×16, 32×32, 48×48, 180×180 (Apple touch icon)
- **Design:** Icon only (pin icon)
- **Background:** Transparent or brand green (#8F9E4F)
- **Do NOT include:** Wordmark or ® symbol

### Icon Specifications
- **Pin icon:** The M-pin icon from the brand system
- **Colors:** 
  - Default: Brand green (#8F9E4F)
  - Inverted: White (on dark/green backgrounds)
- **Padding:** 10% minimum padding around icon edges

---

## Component Usage

### React Component: `<Wordmark />`

```tsx
import Wordmark from "./components/Wordmark";

// Product UI (no ®)
<Wordmark href="/" withIcon={true} size="default" />

// Marketing context (with ®)
<Wordmark href="/" withIcon={true} size="large" showRegistered={true} />

// Mobile (icon-only)
<Wordmark href="/" withIcon={false} size="small" />

// Inverted (white on green)
<Wordmark href="/" withIcon={true} inverted={true} />
```

### Props
- `showRegistered?: boolean` - Show ® symbol (default: false)
- `inverted?: boolean` - White text on green background (default: false)
- `withIcon?: boolean` - Icon + wordmark lockup (default: false)
- `size?: "small" | "default" | "large"` - Size variant (default: "default")
- `href?: string` - Link href (optional)
- `className?: string` - Custom className

---

## Implementation Notes

1. **Font Loading:** Manrope is loaded via `next/font/google` in `app/layout.tsx`
2. **CSS Class:** `.font-manrope` is available globally
3. **Component:** `app/components/Wordmark.tsx` implements all brand guidelines
4. **Current Usage:** Desktop header uses Icon + Wordmark lockup (no ® in product UI)

---

## Examples

### ✅ Correct Usage
- Desktop header: Icon + "Maporia" (no ®)
- Marketing page: Icon + "Maporia®"
- Mobile header: Icon only
- App icon: Pin icon only

### ❌ Incorrect Usage
- Product UI with ® symbol
- All caps "MAPORIA"
- Modified letter-spacing
- Wordmark without icon on desktop
- Icon + wordmark on mobile when space is limited
