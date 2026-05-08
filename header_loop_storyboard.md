# Maporia Header Loop — Storyboard & Generation Prompts

Companion file для [header_loop_scenario.md](./header_loop_scenario.md). Здесь — кадровые промты под image-генератор (Midjourney / Imagen / Flux) + motion-промты под video-генератор (Runway Gen-4, Kling, Veo, Sora).

## Workflow
Каждый сегмент = 1 видео-клип. Для клипа нужны:
1. **First frame** — генерируем как изображение
2. **Last frame** — генерируем как изображение
3. **Motion prompt** — скармливаем оба кадра как keyframe и пишем motion-промт

Все клипы потом склеиваются. Match cuts (короткие 0.3с переходы) — отдельные клипы между активностями.

## Глобальный visual language (применять ко всем сегментам)
- **Aspect ratio:** 21:9 cinematic (или 16:9)
- **Color palette:** golden hour, warm amber + sage green + turquoise + Maporia mint accent. Температура ~3800K-4500K. Один LUT на всё.
- **Lens look:** 35–50mm на активностях, 24mm на pull-out, 14mm на orbital
- **Film treatment:** subtle grain, gentle bloom, shallow DoF, occasional lens dust/flare
- **Motion feel:** gimbal-smooth, never jerky, weighty (Apple-доковский темп)
- **Style baseline:** "cinematic photoreal" для активностей, "stylized 3D illustrated map (Mapbox warm + Studio Ghibli)" для карты, "IMAX nature doc" для космоса

---

## Segment 1 — Open: Космос → Флорида → Карта (0:00 → 0:03)

**First frame prompt**
> Cinematic ultra-wide view of Earth from low orbit, Florida peninsula illuminated by soft golden morning light, terminator line just visible to the west, swirling white cloud formations over the Gulf of Mexico, deep blue Atlantic on the right, soft atmospheric glow on the curved horizon, photorealistic, IMAX nature documentary aesthetic, NASA-quality, subtle lens flare, color graded warm blues and oranges, no text, 21:9 cinematic aspect.

**Last frame prompt**
> Top-down stylized 3D illustrated map of Florida, isometric tilt, warm earthy palette (sandy beige inland, sage green wetlands in the south, turquoise coastline, Maporia mint accents), soft topographic shading, 12-15 glowing pin markers scattered across the state in mixed colors (orange, purple, green, amber), gentle ambient occlusion, soft bokeh on map edges, Mapbox-meets-Studio-Ghibli warmth, no text labels, clean minimal composition, 21:9.

**Motion prompt**
> Camera slowly descends from low orbit toward Florida; clouds part naturally as we approach; mid-descent the photoreal Earth seamlessly cross-dissolves into a stylized illustrated 3D map of the same Florida silhouette — clouds becoming soft abstract UI shapes; pins fade in one-by-one across the map and pulse softly. Smooth, weighty descent — never rushed. No camera shake. 3 seconds.

---

## Segment 2 — Dive 1: Airboat через Эверглейдс (0:03 → 0:06)

**First frame prompt**
> Stylized illustrated Florida map (matching Segment 1's last frame), one orange-glowing pin in the southwest Everglades area opens like an iris/portal, revealing inside it the first frame of a real Everglades scene: vast golden sawgrass prairie at sunset, distant horizon, hint of an airboat in the distance. The portal is mid-bloom, half stylized map / half photoreal scene blending at the edges, cinematic, 21:9.

**Last frame prompt**
> Extreme close-up of water spray erupting from an airboat's caged propeller against a backlit golden sunset, droplets frozen mid-air glowing like sparks, motion blur on the propeller blades behind, deep orange and warm amber palette, shallow depth of field, lens dirt and warm bokeh, cinematic 35mm anamorphic look, 21:9.

**Motion prompt**
> The iris portal expands to fill the entire frame; camera is now low and behind an airboat racing through tall sawgrass reeds in the Florida Everglades at golden hour; reeds whip past the lens; the massive caged propeller spins behind a silhouetted pilot; a great blue heron startles and lifts off from the right; camera tracks the boat for two beats, then pushes in toward the propeller as water spray explodes outward; final beat is the spray frozen mid-air. Fast but smooth, gimbal-stabilized. 3 seconds.

---

## Match Cut 1 — Water spray → steam (0:06 → 0:06.3)

**First frame prompt**
> Same as Segment 2 last frame.

**Last frame prompt**
> Steam billowing upward from a hot bowl of seafood chowder on a rustic wooden table, warm late-afternoon side light, soft bokeh background suggesting an outdoor swamp restaurant, 21:9.

**Motion prompt**
> Water-spray particles morph in shape and density into hot steam particles; orange backlight shifts to warm tungsten side-light; ambient color drops one stop; camera pulls back slightly. Feels like a single continuous pour of energy through the cut. 0.3 seconds.

---

## Segment 3 — Dive 2: Ресторан-хижина в болоте (0:06.3 → 0:09)

**First frame prompt**
> Steaming bowl of stone crab and seafood chowder on a weathered wooden table, fairy lights slightly out of focus overhead, late afternoon, hints of swamp water in the background bokeh, condensation droplets on a beer can next to the bowl, cinematic photoreal, warm tungsten with soft pink-orange ambient, shallow DoF, 50mm lens, 21:9.

**Last frame prompt**
> Wide cinematic shot of a weathered wooden restaurant shack on stilts at the edge of a Florida cypress swamp, golden hour, fairy lights strung along the porch railing, two glowing reflective alligator eyes just above the dark water about 3 meters from the porch, hand-painted wooden sign, palm fronds framing the edges, cypress knees emerging from the water, mood is "cozy danger", cinematic photoreal, 24mm wide lens, 21:9.

**Motion prompt**
> Camera starts tight on the steaming bowl; slowly pulls back and slightly rotates to reveal the rustic wooden porch — fairy lights, beer can, an empty wooden chair, hand-painted menu; continues retreating to a wide reveal of the entire shack on stilts at the swamp edge; on the right, two alligator eyes break the surface of the dark water 3 meters from the porch; cypress trees, late golden hour, warm tungsten porch lights vs cooling sky. Smooth, contemplative pace. 3 seconds.

---

## Match Cut 2 — Restaurant steam → Banya steam (0:09 → 0:09.3)

**First frame prompt**
> Steam rising from a wooden bowl in dim warm light, wisps drifting upward, soft bokeh, warm orange ambient.

**Last frame prompt**
> Thick steam filling a wooden Russian banya parilka interior, dim golden light from a single tungsten lamp, dark wooden plank walls visible behind the haze, droplets on dark wood, sauna stones glowing faintly red in the corner.

**Motion prompt**
> Continuous steam flow — wisps from the bowl dissolve into the dense steam of a Russian banya parilka; warm tungsten ambient deepens by one stop; environment around the steam shifts from swamp wood texture to sauna plank wood (similar wood grain, different scale); barely perceptible match cut. 0.3 seconds.

---

## Segment 4 — Dive 3: Русская баня с пальмой (0:09.3 → 0:12)

**First frame prompt**
> Interior of a Russian banya parilka: thick steam, dark wooden plank walls, single dim warm tungsten lamp glowing, silhouette of a bather holding a leafy oak venik (бaнный веник) just visible through the haze, droplets clinging to dark wood, very atmospheric, 21:9, cinematic photoreal, 50mm lens, shallow DoF.

**Last frame prompt**
> Close-up of a white linen sheet falling slowly through the air mid-frame in a banya, soft warm light, faint steam wisps in the background, dreamy slow-motion feel, motion blur on the fabric folds, 21:9.

**Motion prompt**
> Slow drift forward through dense steam; the silhouetted bather raises and gently swings the oak venik, leaves rustling in slow motion; camera pans right to a small fogged-up window where a palm tree silhouette and bright stars are visible outside (the "we are in Florida" reveal); camera returns inside; a white linen sheet slips off a wooden bench and begins to fall in slow motion as we cut. Mood: warm, intimate, surreal contrast Russia-vs-tropics. 2.7 seconds.

---

## Match Cut 3 — Sheet → Book page (0:12 → 0:12.3)

**First frame prompt**
> White linen sheet falling slowly mid-air, soft warm steam-tinted light, fabric folds catching the light.

**Last frame prompt**
> An old book page turning mid-air, dust particles dancing in a sunbeam from venetian blinds, warm wood tones in the background bokeh, vintage paper texture.

**Motion prompt**
> The falling fabric morphs in texture from linen to vintage paper; color shifts from steam-grey to warm sepia and wood; light source shifts from soft tungsten to a hard angled sunbeam through blinds; the gentle fall motion continues unbroken into a book page turn. 0.3 seconds.

---

## Segment 5 — Dive 4: Старейший книжный (0:12.3 → 0:15)

**First frame prompt**
> Close-up of a vintage book page turning mid-air, sunbeam from venetian blinds illuminating swirling dust particles, warm wood and amber tones, shallow DoF, mysterious and intimate, 21:9, cinematic photoreal, 50mm lens.

**Last frame prompt**
> Wide cinematic interior of an old independent bookstore, dusty wooden floor-to-ceiling shelves crammed with weathered books, an antique map of Florida on the wall (peninsula shape clear, antique cartography typography), a sleeping orange tabby cat curled on a stack of books, sunbeams through venetian blinds creating golden bands across the space, dust particles dancing in the light, brass desk lamp glowing warmly, polished wooden floor, ladder against shelves, 21:9, cinematic photoreal, 35mm lens, shallow DoF on cat.

**Motion prompt**
> Camera slowly pulls back from the turning page; reveals the wooden desk it rests on, then the bookstore interior; floats backward through the narrow aisle between dusty shelves; sunbeams stripe across the lens, flaring warmly; passes the sleeping cat curled on a book stack on the right; an antique Florida map on the wall comes into frame on the left as we settle into a wide. The room breathes. Slow, reverent pace. 2.7 seconds.

---

## Segment 6 — Lift off & Network (0:15 → 0:18)

**First frame prompt**
> Same as Segment 5 last frame: bookstore interior with sleeping cat, dusty shelves, vintage Florida map, golden sunbeams.

**Last frame prompt**
> Top-down stylized illustrated map of Florida (matching Segment 1 last frame style), all four dive-pins (orange in Everglades, purple in southwest swamp, green in central, amber in north) glowing brightly alongside ~12 other softer pins, all connected by thin curving glowing lines forming a delicate network graph across the state, soft pulse of luminance, faint atmospheric glow at the state's edges, 21:9, magical and clean.

**Motion prompt**
> Camera lifts off vertically — accelerating upward through the bookstore ceiling, then through wooden roof beams, then through clouds, then breaking out through atmosphere into low orbit; Florida is revealed below as the stylized illustrated map; all pins spark on simultaneously like fireflies catching fire; thin luminous lines shoot from pin to pin in elegant curves, weaving a delicate network across the entire state; the network pulses once with a soft glow. Movement: powerful upward acceleration, then smooth deceleration as we settle in orbit. Mood: wonder, expansive reveal. 3 seconds.

---

## Segment 7 — Logo (0:18 → 0:19)

**First frame prompt**
> Glowing network of curving lines connecting colored pins on a top-down stylized Florida map, magical bioluminescent feel, soft pulse, 21:9.

**Last frame prompt**
> Maporia logo (clean wordmark in brand colors) elegantly centered on the stylized Florida map, the network of glowing lines visible underneath as a faint luminous background, soft golden halo behind the logo, optional subtle subtitle below ("Sunshine State, decoded" or "Флорида в одной сети"), premium minimalist composition, 21:9.

**Motion prompt**
> The network lines collapse gracefully inward like fireflies converging to form the Maporia logo at the geographic center of Florida; logo materializes with a soft golden flare; remaining network glow fades to subtle background luminance; optional subtitle fades in below at the final beat. Elegant, premium feel. 1 second.

---

## Loop seam (0:19 → 0:00)

**First frame prompt**
> Maporia logo on stylized Florida map, soft golden glow halo, optional subtitle below.

**Last frame prompt**
> Same as Segment 1 first frame: Earth from low orbit, Florida illuminated by golden morning light, swirling clouds, deep blue Atlantic, atmospheric glow.

**Motion prompt**
> Logo dissolves into wisps of cloud; camera continues lifting upward, atmosphere thinning around us; cross-dissolve from stylized illustrated map back to photoreal Earth; clouds re-form naturally; settles to the exact opening composition. The final frame must match Segment 1 first frame pixel-for-pixel for invisible loop. 1 second.

---

## Critical: Loop seam checklist (без этого петля «дёрнет»)
На стыке последнего кадра последнего сегмента и первого кадра Segment 1 должны идеально совпасть:
- Точная позиция Земли в кадре (геометрия, поворот)
- Цвет фона (deep space) и цветовая температура
- Уровень bloom / lens flare
- Скорость камеры — нулевая в обе стороны
- Положение и форма облаков (либо генерим один и тот же кадр для обоих)
- Уровень grain / film texture

**Совет:** генерь Segment 1 first frame и Loop seam last frame **одним и тем же изображением** — потом анимируй из него и в него.

---

## Negative prompts (для всех image-генераций)
> text, watermark, logo (except where specified), people's faces in detail (privacy), tourists, theme park imagery, neon signs, Disney aesthetic, cartoon, cgi-plastic look, oversaturation, harsh blue light, snow, winter

---

## Production checklist
- [ ] Сгенерить все 11 кадров (5 dive first/last + 3 transition first/last + open/close + logo)
- [ ] Утвердить с заказчиком 11 still'ов перед анимацией
- [ ] Прогнать каждый сегмент через video-генератор (Runway Gen-4 / Kling 1.6 / Veo 3) с keyframe pinning
- [ ] Color-grade всё через один LUT для cohesion
- [ ] Склейка в DaVinci/Premiere, проверка loop seam на полной скорости
- [ ] Экспорт: 4K master → web compress (WebM VP9 + MP4 H.264, ≤3MB desktop / ≤1.5MB mobile)
- [ ] Постер-кадр для `<video poster>` — Segment 1 first frame
- [ ] Mobile cut (1:1 или 9:16 версия отдельно) — некоторые сегменты возможно перекомпонуем

---

## Открытые вопросы
1. Финальные 4 активности зафиксированы как `airboat / swamp restaurant / banya / bookstore`?
2. Стиль карты — больше Apple Maps photo-real, или иллюстративный Studio Ghibli warmth, или гибрид?
3. Финальный логотип — пришлёшь SVG, чтобы в Segment 7 подменить точной версией?
4. Aspect ratio — 21:9 (киношное, под hero на десктопе) или 16:9?
5. Какой video-генератор используем (это влияет на длину промтов и параметры)?
