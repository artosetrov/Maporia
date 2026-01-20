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
    { value: "closest", label: "Closest" },
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