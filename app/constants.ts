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