import {
  EXPERIENCE_CATEGORIES,
  SERVICE_CATEGORIES,
  stripTagEmoji,
} from "../constants";

export type HomeSectionFilter = {
  title: string;
  city?: string;
  categories?: string[];
  tag?: string;
  matchText?: string[];
  matchMode?: "any" | "all";
  searchQuery?: string;
  sort?: "popular" | "newest";
  daysAgo?: number; // для "New this week" - created_at >= now - daysAgo
  recentlyViewed?: boolean; // для "Recently viewed" - загружает из localStorage
  recommended?: boolean; // для "Recommended for you" - на основе интересов пользователя
  allListings?: boolean; // для Services/Experiences tabs — общая лента всех карточек типа
};

export type HomeOfferCategorySection = Pick<
  HomeSectionFilter,
  "title" | "categories" | "matchText" | "matchMode" | "searchQuery"
>;

export const HOME_SERVICE_CATEGORY_SECTIONS: HomeOfferCategorySection[] =
  SERVICE_CATEGORIES.map((category) => ({
    title: stripTagEmoji(category),
    categories: [category],
  }));

export const HOME_EXPERIENCE_CATEGORY_SECTIONS: HomeOfferCategorySection[] = [
  { title: "Water Sports", categories: ["🏊 Water Sports"] },
  { title: "Adventures", categories: ["🥾 Adventures"] },
  { title: "Cooking Classes", categories: ["🍳 Cooking Classes"] },
  { title: "Tours & Walks", categories: ["🗺 Tours & Walks"] },
  { title: "Workshops", categories: ["🎨 Workshops"] },
  {
    title: "Music School",
    matchText: ["music"],
    searchQuery: "music",
  },
  {
    title: "Business Club",
    categories: ["💼 Business Club"],
    matchText: ["business", "club"],
    matchMode: "all",
    searchQuery: "business club",
  },
  { title: "Wellness & Retreats", categories: ["🧘 Wellness & Retreats"] },
  { title: "Music & Nightlife", categories: ["🎶 Music & Nightlife"] },
  { title: "Photo Walks", categories: ["📷 Photo Walks"] },
  { title: "Wildlife & Nature", categories: ["🦊 Wildlife & Nature"] },
  { title: "Tastings", categories: ["🍷 Tastings"] },
];

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
