# Maporia Brand Assets

## Symbol (M-Pin Icon)

### Files
- `maporia-symbol.svg` - Primary scalable SVG (viewBox: 0 0 100 100)
- `maporia-symbol-1024.svg` - Large export for app icon pipelines (1024×1024)

### Design Specifications
- **Total height:** 100 units
- **Pin (top):** 55% of height (0-55 units)
- **Gap:** 1 unit between pin and M
- **M (bottom):** 44% of height (56-100 units)
- **Stroke weight:** 6 units (matches Manrope SemiBold 600 visual weight)
- **Style:** Rounded terminals, soft modern curves (Manrope-inspired)
- **Pin inner cutout:** 60% of outer pin width
- **M center V:** Rounded vertex, optically aligned with pin point

### Usage in Next.js

#### Basic Image Tag
```tsx
<img 
  src="/brand/maporia-symbol.svg" 
  alt="Maporia" 
  width={32} 
  height={32}
/>
```

#### With Color Control
The SVG uses `fill="currentColor"`, so you can control color via CSS:

```tsx
<img 
  src="/brand/maporia-symbol.svg" 
  alt="Maporia" 
  width={32} 
  height={32}
  className="text-[#8F9E4F]"
/>
```

#### In React Components
```tsx
// Inline SVG (for better control)
<svg 
  viewBox="0 0 100 100" 
  className="w-8 h-8 text-[#8F9E4F]"
  fill="currentColor"
>
  <use href="/brand/maporia-symbol.svg#symbol" />
</svg>

// Or use as image
<img 
  src="/brand/maporia-symbol.svg" 
  alt="Maporia" 
  className="w-8 h-8"
/>
```

### Size Guidelines
- **24px:** Minimum recommended size (crisp rendering)
- **32px:** Standard UI size
- **48px:** Large UI elements
- **1024px:** App icons (use `maporia-symbol-1024.svg`)

### Color Rules
- **Default:** Brand Green (`#8F9E4F`)
- **Inverted:** White (on brand green backgrounds)
- **Always:** Single color, no gradients, no effects

### Technical Notes
- SVG uses `fill-rule="evenodd"` for pin hole cutout
- All paths are filled (no strokes)
- Transparent background
- Optimized for crisp rendering at small sizes
- Centered in viewBox with consistent optical padding
