#!/usr/bin/env npx tsx

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type PlaceKind = "location" | "service" | "experience";

type PlaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  city_name_cached: string | null;
  kind: PlaceKind | null;
  categories: string[] | null;
  tags: string[] | null;
  access_level: string | null;
  is_hidden: boolean | null;
  visibility: string | null;
};

type Env = Record<string, string>;

type FillProposal = {
  id: string;
  title: string;
  kind: string;
  categories: string[];
  tags: string[];
};

type Rule = {
  tag: string;
  patterns: RegExp[];
};

const root = process.cwd();
const apply = process.argv.includes("--apply");

const TAG_OVERRIDES: Record<string, string[]> = {
  "bathhouse": ["Wellness", "Spa", "Sauna", "Service"],
  "cox science center and aquarium": [
    "Science",
    "Aquarium",
    "Family",
    "Museum",
    "Wildlife",
  ],
  "designing ai products": ["Design", "AI", "Creative", "Service"],
  "environmental learning center": [
    "Nature",
    "Wildlife",
    "Boardwalk",
    "Learning",
    "Experience",
  ],
  "facial massage": ["Facial", "Massage", "Wellness", "Spa"],
  "josh's deli": ["Deli", "Sandwich", "Food"],
  "josh’s deli": ["Deli", "Sandwich", "Food"],
  "kiska lounge": ["Nightlife", "Drinks", "Lounge", "Cozy"],
  "laspada's original hoagies - lauderdale-by-the-sea": [
    "Deli",
    "Sandwich",
    "Food",
    "Local",
  ],
  "magnolia caffee": ["Coffee", "Cafe", "Cozy", "Food"],
  "massage therapist": ["Massage", "Wellness", "Spa", "Service"],
  "old heidelberg restaurant": ["German", "Beer", "Food", "Cozy"],
  "old spanish monastery": ["Historic", "Architecture", "Garden", "Hidden"],
  "paddles by the sea": [
    "Water Sports",
    "Paddle",
    "Beach",
    "Waterfront",
    "Service",
  ],
  "revenew business club": [
    "Business Club",
    "Networking",
    "Workshop",
    "Experience",
  ],
  "solomon's castle": ["Art", "Castle", "Quirky", "Hidden", "Historic"],
  "spaghetto factory": ["Italian", "Pasta", "Food", "Hidden"],
  "tate's comics": ["Comics", "Collectibles", "Shop", "Hidden"],
  "the chimney house": ["Cafe", "Historic", "House", "Garden", "Food"],
  "the holly hill gnome tree": ["Hidden", "Quirky", "Tree", "Nature"],
  "tower at tree tops": ["Park", "Fishing", "Family", "Scenic", "Nature"],
};

const TAG_TO_ALLOWED_TAGS: Record<string, string[]> = {
  Quiet: ["Things to do"],
  Hidden: ["Things to do"],
  Cozy: ["Things to do"],
  Vibe: ["Things to do"],
  Food: ["Cuisine"],
  Beach: ["Waterfront"],
  Architecture: ["Historic"],
  Family: ["Children"],
  Wildlife: ["Animals"],
  Nature: ["Park"],
  Shop: ["Market"],
  Wine: ["Beer"],
  Drinks: ["Beer"],
  Photo: ["Things to do"],
  Scenic: ["Things to do"],
  Deli: ["Cuisine"],
  Springs: ["Waterfront"],
  Wellness: ["Things to do"],
  Cocktails: ["Speakeasy"],
  Wetlands: ["Park"],
  Romantic: ["Things to do"],
  Service: ["Things to do"],
  Trail: ["Hike"],
  Boardwalk: ["Hike"],
  Greek: ["Cuisine"],
  Spa: ["Things to do"],
  Sunset: ["Things to do"],
  Arcade: ["Game"],
  Cafe: ["Coffee"],
  Design: ["Things to do"],
  Experience: ["Things to do"],
  Latin: ["Cuisine"],
  Massage: ["Things to do"],
  Nightlife: ["Beer"],
  Pizza: ["Cuisine"],
  Quirky: ["Things to do"],
  Sandwich: ["Cuisine"],
  Workshop: ["Things to do"],
  AI: ["Things to do"],
  Aquarium: ["Animals", "Museum"],
  "Business Club": ["Things to do"],
  Castle: ["Historic", "House"],
  Chef: ["Cuisine"],
  Church: ["Historic"],
  Coaching: ["Things to do"],
  Collectibles: ["Market"],
  Comics: ["Books", "Market"],
  Creative: ["Art"],
  Facial: ["Things to do"],
  Fishing: ["Waterfront"],
  Fitness: ["Things to do"],
  German: ["Cuisine"],
  Interior: ["Things to do"],
  Learning: ["Things to do"],
  Local: ["Things to do"],
  Lounge: ["Beer"],
  Networking: ["Things to do"],
  Online: ["Things to do"],
  Paddle: ["Waterfront"],
  Pasta: ["Italian"],
  Sauna: ["Things to do"],
  Science: ["Museum"],
  "Street Food": ["Street food"],
  Tree: ["Park"],
  Uzbek: ["Cuisine"],
  "Water Sports": ["Waterfront"],
};

const RULES: Rule[] = [
  rule("Speakeasy", /speakeasy|secret bar/),
  rule("Cocktails", /\bcocktails?\b|mixology|\bmezcal\b|\brum\b|elixir/),
  rule("Wine", /\bwines?\b|winery|bottle ?shop/),
  rule("Beer", /\bbeers?\b|brewery|brewing|sports bar/),
  rule("Nightlife", /nightlife|dancing|after dark|\blounge\b/),
  rule("Coffee", /\bcoffee\b|\bcafe\b|\bcafé\b|espresso|latte/),
  rule("Bakery", /bakery|baklava|pastr|dessert|muffin|croissant|cake|sweet treat/),
  rule("Pizza", /pizza|pizzeria/),
  rule("Burger", /burger|whiskey bar/),
  rule(
    "Seafood",
    /seafood|fish (co|market|peddler|camp|shop)|fresh fish|\bcrab\b|raw bar|oyster|fresh catch|waterfront restaurant/
  ),
  rule("Deli", /\bdeli\b|delicatessen|\bsubs?\b|sandwich/),
  rule("Italian", /italian|pasta|spaghetto|roman[a]?/),
  rule("Greek", /greek|tarpon springs|baklava|galaktoboureko/),
  rule("Spanish", /spanish|asturiano|paella|tapas/),
  rule("Uzbek", /uzbek/),
  rule("Latin", /empanada|sofrito|latin|peruvian|cuban/),
  rule("American", /american|roadhouse/),
  rule("Street Food", /street food|marketplace|food hall/),
  rule("Garden", /garden|botanical|botanic|lush greenery|flowering|flowers|plants/),
  rule("Park", /\bpark\b|preserve|state park|urban oasis|picnic/),
  rule("Beach", /\bbeach\b|waves|salt air|\bsand\b|coast/),
  rule("Waterfront", /waterfront|intracoastal|dockside|bay|river|by the water|water views/),
  rule("Springs", /spring|springs|mineral|clear water/),
  rule("Wetlands", /wetland|everglades|lagoon|mangrove/),
  rule("Boardwalk", /boardwalk/),
  rule("Trail", /\btrails?\b|\bhiking?\b|nature walk/),
  rule("Wildlife", /wildlife|alligator|birds?|turtle|butterfl|aquarium|animals?|reptile/),
  rule("Family", /kids?|children|family|hands-on|miniature train|u-pick/),
  rule("Museum", /museum|exhibit|gallery|collector|science center|aquarium/),
  rule("Art", /\bart\b|artist|sculpture|gallery|four arts|posters?/),
  rule("Historic", /historic|history|old florida|1927|1920|pioneer|preservation|heritage|old-world/),
  rule("House", /\bhouse\b|\bhome\b|cottage|residence|castle|mansion/),
  rule("Architecture", /architecture|spanish colonial|arches|stone|marble|mediterranean/),
  rule("Hotel", /hotel|resort/),
  rule("Music", /music|piano|live music/),
  rule("Comics", /comic|collectibles|novelty gifts/),
  rule("Books", /books|library/),
  rule("Shop", /shop|market|boutique|bottleshop|collectibles|gifts/),
  rule("Vintage", /vintage|old-school|nostalgic|yesteryear/),
  rule("Arcade", /arcade|old-school arcade|games/),
  rule("Photo", /photo|photography|instagram|scenic|views?/),
  rule("Sunset", /sunset|golden hour/),
  rule("Quiet", /quiet|calm|peaceful|hush|retreat|sanctuary/),
  rule("Cozy", /cozy|comfort|warm|homey|neighborhood|regulars/),
  rule("Romantic", /romantic|date|candle|intimate/),
  rule("Wellness", /\bwellness\b|\bspa\b|\bbathhouse\b|\bsauna\b|cold plunge|\bmineral\b|retreat|esthetician/),
  rule("Massage", /massage|face sculpting|facial/),
  rule("Design", /design|designer|ux|product design/),
  rule("AI", /\bai\b|artificial intelligence/),
  rule("Workshop", /workshop|learning center|class|hands-on/),
  rule("Hidden", /hidden|secret|tucked away|local gem|best-kept secret|rare|stumbling/),
  rule("Scenic", /scenic|views?|observation|tower|lookout|horizon/),
  rule("Vibe", /vibe|atmosphere|energy|buzzy|lively|playful|quirky/),
];

const CATEGORY_FALLBACKS: Array<[RegExp, string[]]> = [
  [/Food & Drinks/, ["Food"]],
  [/Bars & Wine/, ["Drinks"]],
  [/Nature & Walks/, ["Nature"]],
  [/Culture & History/, ["Historic"]],
  [/Shops & Markets/, ["Shop"]],
  [/Hidden & Unique/, ["Hidden"]],
  [/Scenic & Views/, ["Scenic"]],
  [/Vibe & Atmosphere/, ["Vibe"]],
  [/Crime & Haunted/, ["Haunted"]],
  [/Spa & Wellness/, ["Wellness"]],
  [/Massage/, ["Massage", "Wellness"]],
  [/Creative Services/, ["Creative", "Design"]],
  [/Wildlife & Nature/, ["Wildlife", "Nature"]],
];

function rule(tag: string, ...patterns: RegExp[]): Rule {
  return { tag, patterns };
}

function readEnvFile(filePath: string): Env {
  if (!existsSync(filePath)) return {};

  const result: Env = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }

  return result;
}

function getEnvValue(envFile: Env, key: string): string | undefined {
  return process.env[key] ?? envFile[key];
}

function assertEnv(envFile: Env, key: string): string {
  const value = getEnvValue(envFile, key);
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function createSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  return createClient(supabaseUrl, supabaseKey);
}

function isVisible(place: PlaceRow): boolean {
  return place.is_hidden !== true && place.visibility !== "hidden";
}

function titleOf(place: PlaceRow): string {
  return place.title?.trim() || "(untitled)";
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[’]/g, "'");
}

function textOf(place: PlaceRow): string {
  return [
    place.title,
    place.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function addTag(tags: string[], seen: Set<string>, tag: string): void {
  const key = tag.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  tags.push(tag);
}

function inferTags(place: PlaceRow): string[] {
  const overriddenTags = TAG_OVERRIDES[normalizeTitle(titleOf(place))];
  if (overriddenTags) return overriddenTags;

  const text = textOf(place);
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const ruleItem of RULES) {
    if (ruleItem.patterns.some((pattern) => pattern.test(text))) {
      addTag(tags, seen, ruleItem.tag);
    }

    if (tags.length >= 5) return tags;
  }

  for (const category of place.categories ?? []) {
    for (const [pattern, fallbackTags] of CATEGORY_FALLBACKS) {
      if (!pattern.test(category)) continue;
      for (const tag of fallbackTags) {
        addTag(tags, seen, tag);
        if (tags.length >= 5) return tags;
      }
    }
  }

  if (place.kind === "service") addTag(tags, seen, "Service");
  if (place.kind === "experience") addTag(tags, seen, "Experience");
  if (tags.length === 0) addTag(tags, seen, "Local");

  return tags.slice(0, 5);
}

function coerceToAllowedTags(tags: string[], allowedTags: Set<string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const replacements = allowedTags.has(tag)
      ? [tag]
      : TAG_TO_ALLOWED_TAGS[tag] ?? ["Things to do"];

    for (const replacement of replacements) {
      if (!allowedTags.has(replacement)) {
        throw new Error(
          `Tag mapping produced value outside allowed list: ${tag} -> ${replacement}`
        );
      }

      const key = replacement.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(replacement);
    }
  }

  return result.slice(0, 5);
}

async function fetchMissingTagPlaces(
  supabase: ReturnType<typeof createSupabaseClient>
): Promise<PlaceRow[]> {
  const pageSize = 1000;
  const rows: PlaceRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("places")
      .select(
        "id,title,description,address,city,city_name_cached,kind,categories,tags,access_level,is_hidden,visibility"
      )
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as PlaceRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows.filter(
    (place) =>
      isVisible(place) && (!Array.isArray(place.tags) || place.tags.length === 0)
  );
}

async function fetchAllowedTags(
  supabase: ReturnType<typeof createSupabaseClient>
): Promise<Set<string>> {
  const { data, error } = await supabase.from("tags").select("name");
  if (error) throw error;
  return new Set((data ?? []).map((tag) => String(tag.name)));
}

async function main(): Promise<void> {
  const envFile = readEnvFile(path.join(root, ".env.local"));
  const supabaseUrl = assertEnv(envFile, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = assertEnv(envFile, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const places = await fetchMissingTagPlaces(supabase);
  const allowedTags = await fetchAllowedTags(supabase);
  const proposals: FillProposal[] = places.map((place) => ({
    id: place.id,
    title: titleOf(place),
    kind: place.kind ?? "unknown",
    categories: place.categories ?? [],
    tags: coerceToAllowedTags(inferTags(place), allowedTags),
  }));

  if (apply) {
    for (const proposal of proposals) {
      const { error } = await supabase
        .from("places")
        .update({ tags: proposal.tags })
        .eq("id", proposal.id);

      if (error) throw error;
    }
  }

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Places without tags: ${places.length}`);
  console.log(`Tag fills ${apply ? "applied" : "planned"}: ${proposals.length}`);

  for (const proposal of proposals) {
    console.log(
      `- ${proposal.title} [${proposal.kind}]: ${proposal.tags.join(", ")}`
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
