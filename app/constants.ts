// Базовый список = location categories (legacy / для обратной совместимости).
// Новые места: используй getCategoriesByKind(place.kind).
export const CATEGORIES = [
    "🍽 Food & Drinks",
    "🍸 Bars & Wine",
    "🌅 Scenic & Views",
    "🌳 Nature & Walks",
    "🎭 Culture & History",
    "🛍 Shops & Markets",
    "🤫 Hidden & Unique",
    "✨ Vibe & Atmosphere",
    "👻 Crime & Haunted",
  ] as const;

  export type Category = (typeof CATEGORIES)[number];

  // ── Kind-specific категории ───────────────────────────────────
  // location использует CATEGORIES (alias ниже), service / experience —
  // отдельные таксономии под Airbnb-стиль каталога.

  export const LOCATION_CATEGORIES = CATEGORIES;

  export const SERVICE_CATEGORIES = [
    "📸 Photography",
    "👨‍🍳 Chefs & Catering",
    "💆 Massage",
    "🍱 Prepared Meals",
    "💪 Training & Fitness",
    "💄 Makeup",
    "✂️ Hair",
    "🧖 Spa & Wellness",
    "🎨 Creative Services",
    "🛠 Other Services",
  ] as const;

  export const EXPERIENCE_CATEGORIES = [
    "🏊 Water Sports",
    "🥾 Adventures",
    "🍳 Cooking Classes",
    "🗺 Tours & Walks",
    "🎨 Workshops",
    "💼 Business Club",
    "🧘 Wellness & Retreats",
    "🎶 Music & Nightlife",
    "📷 Photo Walks",
    "🦊 Wildlife & Nature",
    "🍷 Tastings",
  ] as const;

  /**
   * Возвращает категории, релевантные для конкретного типа карточки.
   * Для FiltersModal с пустым выбором — union без дублей.
   */
  export function getCategoriesByKind(
    kind: 'location' | 'service' | 'experience' | null | undefined
  ): readonly string[] {
    if (kind === 'service') return SERVICE_CATEGORIES;
    if (kind === 'experience') return EXPERIENCE_CATEGORIES;
    return LOCATION_CATEGORIES;
  }

  // Vibe / Emotions for filtering
  export const VIBES = [
    "Romantic",
    "Relaxing",
    "Scenic",
    "Vibrant",
    "Quiet",
    "Adventurous",
    "Cozy",
    "Luxury",
  ] as const;

  export type Vibe = (typeof VIBES)[number];

  // Sort options
  export const SORT_OPTIONS = [
    { value: "newest", label: "Newest" },
    { value: "most_liked", label: "Most liked" },
    { value: "most_commented", label: "Most commented" },
  ] as const;

  // Distance options
  export const DISTANCE_OPTIONS = [
    { value: "near_me", label: "Near me" },
    { value: "1", label: "1 mi" },
    { value: "5", label: "5 mi" },
    { value: "10", label: "10 mi" },
  ] as const;

  // Available cities for filtering (Airbnb-style).
  // Top-5 by visible place count (snapshot 2026-05-08, Supabase places table).
  // Sorted by count desc, not alphabetically.
  export const CITIES = [
    "Fort Lauderdale", // 43
    "Miami",           // 26
    "West Palm Beach", // 12
    "Coral Gables",    // 11
    "Boca Raton",      // 10
  ] as const;
  
  export type City = (typeof CITIES)[number];
  
  export const DEFAULT_CITY = "Fort Lauderdale";

  // Emoji для тегов (по умолчанию 🏷️). Ключи в нижнем регистре.
  const TAG_EMOJI_MAP: Record<string, string> = {
    american: "🇺🇸",
    animals: "🐾",
    art: "🎨",
    bbq: "🍖",
    bakery: "🥐",
    bar: "🍹",
    basket: "🧺",
    beach: "🏖️",
    books: "📚",
    botanic: "🌿",
    brazilian: "🇧🇷",
    bread: "🍞",
    brunch: "🥞",
    burger: "🍔",
    children: "👶",
    chinese: "🥡",
    city: "🏙️",
    coffee: "☕",
    cozy: "🛋️",
    cuisine: "🍽️",
    culture: "🎭",
    dessert: "🍰",
    drinks: "🍸",
    farm: "🚜",
    food: "🍽️",
    free: "🆓",
    garden: "🌷",
    haunted: "👻",
    hidden: "🤫",
    hike: "🥾",
    historic: "🏛️",
    historical: "🏛️",
    history: "🏛️",
    hotel: "🏨",
    house: "🏠",
    icecream: "🍦",
    indian: "🍛",
    instagram: "📱",
    italian: "🍝",
    key: "🔑",
    library: "📚",
    lighthouse: "🗼",
    luxury: "✨",
    market: "🛒",
    mexican: "🌮",
    monument: "🗽",
    museum: "🏛️",
    music: "🎵",
    nature: "🌳",
    nightlife: "🌙",
    persian: "🍽️",
    peruvian: "🇵🇪",
    photo: "📸",
    pizza: "🍕",
    plaza: "🏙️",
    quiet: "🤫",
    relaxing: "😌",
    resort: "🏖️",
    rooftop: "🌆",
    romantic: "💕",
    ruins: "🏚️",
    scenic: "🖼️",
    seafood: "🦞",
    shop: "🛍️",
    show: "🎭",
    spanish: "🇪🇸",
    speakesy: "🍸",
    sushi: "🍣",
    sunset: "🌅",
    temple: "⛩️",
    thailand: "🇹🇭",
    "things to do": "✅",
    thrift: "🛍️",
    tower: "🗼",
    view: "👀",
    vibe: "✨",
    vintage: "📻",
    vibrant: "🎉",
    waterfront: "🌊",
    wine: "🍷",
    adventurous: "🧗",
  };

  export const DEFAULT_TAG_EMOJI = "🏷️";

  /** Strips leading emoji(s) from a tag name. E.g. "🍣 Sushi" → "Sushi", "Park" → "Park" */
  export function stripTagEmoji(tag: string): string {
    if (!tag) return tag;
    return tag.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, "").trim();
  }

  /** Returns emoji for tag: customEmoji if provided and non-empty, else extracted from tag name, from TAG_EMOJI_MAP, or default. */
  export function getTagEmoji(tag: string, customEmoji?: string | null): string {
    if (typeof customEmoji === "string" && customEmoji.trim()) return customEmoji.trim();
    if (!tag || typeof tag !== "string") return DEFAULT_TAG_EMOJI;

    // If tag starts with an emoji, use it directly
    const emojiMatch = tag.match(/^[\p{Extended_Pictographic}\uFE0F\u200D]+/u);
    if (emojiMatch) return emojiMatch[0];

    // Otherwise look up the plain name in the emoji map
    const key = tag.trim().toLowerCase();
    return TAG_EMOJI_MAP[key] ?? DEFAULT_TAG_EMOJI;
  }
