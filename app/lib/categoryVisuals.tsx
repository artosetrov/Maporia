import {
  Binoculars,
  BookOpen,
  Briefcase,
  Brush,
  Building2,
  Camera,
  ChefHat,
  CookingPot,
  Dumbbell,
  Flower2,
  Footprints,
  Gem,
  Ghost,
  HandHeart,
  Landmark,
  Map as MapIcon,
  MapPin,
  Music,
  Palette,
  PawPrint,
  Sailboat,
  Scissors,
  ShoppingBag,
  Sparkles,
  Trees,
  Utensils,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { stripTagEmoji } from "../constants";

export type CategoryVisual = {
  Icon: LucideIcon;
  bg: string;
  icon: string;
  accent: string;
};

export const DEFAULT_CATEGORY_VISUAL: CategoryVisual = {
  Icon: MapPin,
  bg: "bg-[#F3F5ED]",
  icon: "text-[#7F8F3F]",
  accent: "bg-[#DDE6BF]",
};

export const DEFAULT_SERVICE_VISUAL: CategoryVisual = {
  Icon: Wrench,
  bg: "bg-[#F3F5ED]",
  icon: "text-[#7F8F3F]",
  accent: "bg-[#DDE6BF]",
};

export const DEFAULT_EXPERIENCE_VISUAL: CategoryVisual = {
  Icon: Sparkles,
  bg: "bg-[#F4F1EA]",
  icon: "text-[#A8684A]",
  accent: "bg-[#E8D4C4]",
};

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  "Food & Drinks": {
    Icon: Utensils,
    bg: "bg-[#F7F3E8]",
    icon: "text-[#9A7A2D]",
    accent: "bg-[#EADFAE]",
  },
  "Bars & Wine": {
    Icon: Wine,
    bg: "bg-[#F6EEF0]",
    icon: "text-[#995668]",
    accent: "bg-[#E7C5CE]",
  },
  "Scenic & Views": {
    Icon: Binoculars,
    bg: "bg-[#EDF5F7]",
    icon: "text-[#4C7C89]",
    accent: "bg-[#C8E1E7]",
  },
  "Nature & Walks": {
    Icon: Trees,
    bg: "bg-[#EFF5EC]",
    icon: "text-[#5E8447]",
    accent: "bg-[#D2E5C2]",
  },
  "Culture & History": {
    Icon: Landmark,
    bg: "bg-[#F3F2EC]",
    icon: "text-[#7E7345]",
    accent: "bg-[#E2D9B8]",
  },
  "Shops & Markets": {
    Icon: ShoppingBag,
    bg: "bg-[#F5F1EC]",
    icon: "text-[#8D6A4B]",
    accent: "bg-[#E7D5C1]",
  },
  "Hidden & Unique": {
    Icon: Gem,
    bg: "bg-[#F3EFF5]",
    icon: "text-[#7B6093]",
    accent: "bg-[#D9CBE5]",
  },
  "Vibe & Atmosphere": {
    Icon: Sparkles,
    bg: "bg-[#F2F5EC]",
    icon: "text-[#72823D]",
    accent: "bg-[#DCE7B9]",
  },
  "Crime & Haunted": {
    Icon: Ghost,
    bg: "bg-[#F1F0E8]",
    icon: "text-[#6F6A55]",
    accent: "bg-[#DFD8A8]",
  },
  Photography: {
    Icon: Camera,
    bg: "bg-[#F0F4F2]",
    icon: "text-[#55786E]",
    accent: "bg-[#CFE0DB]",
  },
  "Chefs & Catering": {
    Icon: ChefHat,
    bg: "bg-[#F6F1EA]",
    icon: "text-[#9A6544]",
    accent: "bg-[#EAD4BF]",
  },
  Massage: {
    Icon: HandHeart,
    bg: "bg-[#F2F5EC]",
    icon: "text-[#72823D]",
    accent: "bg-[#DCE7B9]",
  },
  "Prepared Meals": {
    Icon: CookingPot,
    bg: "bg-[#F7F3E8]",
    icon: "text-[#9A7A2D]",
    accent: "bg-[#EADFAE]",
  },
  "Training & Fitness": {
    Icon: Dumbbell,
    bg: "bg-[#EEF4F5]",
    icon: "text-[#4D7882]",
    accent: "bg-[#C8E0E5]",
  },
  Makeup: {
    Icon: Brush,
    bg: "bg-[#F6EEF1]",
    icon: "text-[#A65C72]",
    accent: "bg-[#E9C8D2]",
  },
  Hair: {
    Icon: Scissors,
    bg: "bg-[#F5F1EC]",
    icon: "text-[#8D6A4B]",
    accent: "bg-[#E7D5C1]",
  },
  "Spa & Wellness": {
    Icon: Flower2,
    bg: "bg-[#EEF4ED]",
    icon: "text-[#5E8A58]",
    accent: "bg-[#CDE1C7]",
  },
  "Creative Services": {
    Icon: Palette,
    bg: "bg-[#F3EFF5]",
    icon: "text-[#7B6093]",
    accent: "bg-[#D9CBE5]",
  },
  "Other Services": DEFAULT_SERVICE_VISUAL,
  "Water Sports": {
    Icon: Sailboat,
    bg: "bg-[#EDF5F7]",
    icon: "text-[#4C7C89]",
    accent: "bg-[#C8E1E7]",
  },
  Adventures: {
    Icon: Footprints,
    bg: "bg-[#F1F5ED]",
    icon: "text-[#668049]",
    accent: "bg-[#D5E4C5]",
  },
  "Cooking Classes": {
    Icon: BookOpen,
    bg: "bg-[#F6F1EA]",
    icon: "text-[#9A6544]",
    accent: "bg-[#EAD4BF]",
  },
  "Tours & Walks": {
    Icon: MapIcon,
    bg: "bg-[#F3F2EC]",
    icon: "text-[#7E7345]",
    accent: "bg-[#E2D9B8]",
  },
  Workshops: {
    Icon: Palette,
    bg: "bg-[#F3EFF5]",
    icon: "text-[#7B6093]",
    accent: "bg-[#D9CBE5]",
  },
  "Business Club": {
    Icon: Building2,
    bg: "bg-[#EEF2F1]",
    icon: "text-[#5C776F]",
    accent: "bg-[#CBDDD8]",
  },
  "Wellness & Retreats": {
    Icon: Flower2,
    bg: "bg-[#EEF4ED]",
    icon: "text-[#5E8A58]",
    accent: "bg-[#CDE1C7]",
  },
  "Music & Nightlife": {
    Icon: Music,
    bg: "bg-[#F4F0EC]",
    icon: "text-[#9A6048]",
    accent: "bg-[#E7CDBF]",
  },
  "Photo Walks": {
    Icon: Camera,
    bg: "bg-[#F0F4F2]",
    icon: "text-[#55786E]",
    accent: "bg-[#CFE0DB]",
  },
  "Wildlife & Nature": {
    Icon: PawPrint,
    bg: "bg-[#EFF5EC]",
    icon: "text-[#5E8447]",
    accent: "bg-[#D2E5C2]",
  },
  Tastings: {
    Icon: Wine,
    bg: "bg-[#F6EEF0]",
    icon: "text-[#995668]",
    accent: "bg-[#E7C5CE]",
  },
};

export function getCategoryLabel(category: string): string {
  return stripTagEmoji(category);
}

export function getCategoryVisual(
  category: string,
  fallback: CategoryVisual = DEFAULT_CATEGORY_VISUAL
): CategoryVisual {
  return CATEGORY_VISUALS[getCategoryLabel(category)] ?? fallback;
}

export function CategoryVisualIcon({
  category,
  className = "h-5 w-5",
  fallback,
  strokeWidth = 1.8,
}: {
  category: string;
  className?: string;
  fallback?: CategoryVisual;
  strokeWidth?: number;
}) {
  const visual = getCategoryVisual(category, fallback);
  const VisualIcon = visual.Icon;
  return (
    <VisualIcon
      aria-hidden="true"
      className={`${className} ${visual.icon}`}
      strokeWidth={strokeWidth}
    />
  );
}

