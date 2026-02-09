export type HomeSectionFilter = {
  title: string;
  city?: string;
  categories?: string[];
  tag?: string;
  sort?: "popular" | "newest";
  daysAgo?: number; // для "New this week" - created_at >= now - daysAgo
  recentlyViewed?: boolean; // для "Recently viewed" - загружает из localStorage
  recommended?: boolean; // для "Recommended for you" - на основе интересов пользователя
};

export const HOME_SECTIONS: HomeSectionFilter[] = [
  {
    title: "Recently viewed",
    recentlyViewed: true,
  },
  {
    title: "Popular in Fort Lauderdale",
    city: "Fort Lauderdale",
    sort: "popular",
  },
  {
    title: "Hidden Gems (Local-only)",
    city: "Fort Lauderdale",
    categories: ["🤫 Hidden & Unique"],
  },
  {
    title: "Unusual Restaurants",
    city: "Fort Lauderdale",
    categories: ["🍽 Food & Drinks", "🍸 Bars & Wine"],
  },
  {
    title: "Romantic & Vibe Spots",
    city: "Fort Lauderdale",
    categories: ["✨ Vibe & Atmosphere"],
  },
  {
    title: "Scenic & Views",
    city: "Fort Lauderdale",
    categories: ["🌅 Scenic & Views"],
  },
  {
    title: "Nature & Walks Nearby",
    city: "Fort Lauderdale",
    categories: ["🌳 Nature & Walks"],
  },
  {
    title: "Culture & History",
    city: "Fort Lauderdale",
    categories: ["🎭 Culture & History"],
  },
  {
    title: "New this week",
    city: "Fort Lauderdale",
    daysAgo: 7,
    sort: "newest",
  },
];
