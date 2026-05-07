/**
 * Shared types for the Home page (`app/page.tsx`) and its sub-components.
 *
 * `HomeKind` mirrors `places.kind` but only the values that the home page
 * surfaces as tabs. Live source of truth for the union is the DB CHECK
 * constraint in migration `add_place_kind_and_pricing_fields` (location |
 * service | experience). Keep these in sync.
 */
export type HomeKind = "location" | "service" | "experience";

/**
 * Tab metadata. Order here = visual order in the tab strip.
 *
 * Why centralised: HomeTabsSegmented and the legacy <Pill> tab block
 * inside page.tsx both consume this list. Editing the labels in one
 * place ensures both paths stay in sync during the redesign rollout.
 */
export const HOME_TABS: { id: HomeKind; label: string; emoji: string }[] = [
  { id: "location", label: "Locations", emoji: "📍" },
  { id: "experience", label: "Experiences", emoji: "✨" },
  { id: "service", label: "Services", emoji: "🛠" },
];
