export const CATEGORIES = [
    "🍽 Food & Drinks",
    "🍸 Bars & Wine",
    "🌅 Scenic & Rooftop Views",
    "🌳 Nature & Walks",
    "🎭 Culture & History",
    "🛍 Shops & Markets",
    "🤫 Hidden & Unique",
    "✨ Vibe & Atmosphere",
    "👻 Crime & Haunted Spots",
  ] as const;
  
  export type Category = (typeof CATEGORIES)[number];

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

  // Available cities for filtering (Airbnb-style)
  export const CITIES = [
    "Dania Beach",
    "Fort Lauderdale",
    "Lauderhill",
    "Lighthouse Point",
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

  /** Returns emoji for tag: customEmoji if provided and non-empty, else from TAG_EMOJI_MAP or default. */
  export function getTagEmoji(tag: string, customEmoji?: string | null): string {
    if (typeof customEmoji === "string" && customEmoji.trim()) return customEmoji.trim();
    if (!tag || typeof tag !== "string") return DEFAULT_TAG_EMOJI;
    const key = tag.trim().toLowerCase();
    return TAG_EMOJI_MAP[key] ?? DEFAULT_TAG_EMOJI;
  }