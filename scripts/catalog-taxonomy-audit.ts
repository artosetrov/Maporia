#!/usr/bin/env npx tsx

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  EXPERIENCE_CATEGORIES,
  LOCATION_CATEGORIES,
  SERVICE_CATEGORIES,
} from "../app/constants";

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

type TagRow = {
  id: string;
  name: string;
  category_ids: string[] | null;
  emoji: string | null;
};

type Env = Record<string, string>;

type PlaceTagFix = {
  id: string;
  title: string;
  before: string[];
  after: string[];
};

type TagRename = {
  id: string;
  before: string;
  after: string;
  status: "ready" | "target-exists";
};

type Issue = {
  id: string;
  title: string;
  kind: string;
  reason: string;
};

const root = process.cwd();
const apply = process.argv.includes("--apply");

const TAG_RENAMES: Record<string, string> = {
  "Сity": "City",
  Speakesy: "Speakeasy",
  Icecream: "Ice Cream",
  Historical: "Historic",
  "🍣 Sushi": "Sushi",
  "👨‍🍳 Chef": "Chef",
};

const CATEGORIES_BY_KIND: Record<PlaceKind, readonly string[]> = {
  location: LOCATION_CATEGORIES,
  service: SERVICE_CATEGORIES,
  experience: EXPERIENCE_CATEGORIES,
};

function createSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  return createClient(supabaseUrl, supabaseKey);
}

type SupabaseClientForScript = ReturnType<typeof createSupabaseClient>;

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
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function normalizeTags(tags: string[] | null): string[] {
  if (!Array.isArray(tags)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = TAG_RENAMES[tag] ?? tag;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function titleOf(place: PlaceRow): string {
  return place.title?.trim() || "(untitled)";
}

function isVisible(place: PlaceRow): boolean {
  return place.is_hidden !== true && place.visibility !== "hidden";
}

function isKnownKind(kind: string | null): kind is PlaceKind {
  return kind === "location" || kind === "service" || kind === "experience";
}

function unknownCategories(place: PlaceRow): string[] {
  if (!isKnownKind(place.kind)) return place.categories ?? [];
  const allowed = new Set(CATEGORIES_BY_KIND[place.kind]);
  return (place.categories ?? []).filter((category) => !allowed.has(category));
}

function findIssues(places: PlaceRow[], allowedTagNames: Set<string>): Issue[] {
  const issues: Issue[] = [];

  for (const place of places) {
    const kind = place.kind ?? "unknown";
    const categories = place.categories ?? [];
    const tags = place.tags ?? [];
    const unknown = unknownCategories(place);

    if (!isKnownKind(place.kind)) {
      issues.push({
        id: place.id,
        title: titleOf(place),
        kind,
        reason: "unknown kind",
      });
    }

    if (categories.length === 0) {
      issues.push({
        id: place.id,
        title: titleOf(place),
        kind,
        reason: "missing categories",
      });
    }

    if (tags.length === 0) {
      issues.push({
        id: place.id,
        title: titleOf(place),
        kind,
        reason: "missing tags",
      });
    }

    if (unknown.length > 0) {
      issues.push({
        id: place.id,
        title: titleOf(place),
        kind,
        reason: `category not allowed for kind: ${unknown.join(", ")}`,
      });
    }

    const tagsOutsideAllowedList = tags.filter((tag) => !allowedTagNames.has(tag));
    if (tagsOutsideAllowedList.length > 0) {
      issues.push({
        id: place.id,
        title: titleOf(place),
        kind,
        reason: `tags outside allowed list: ${tagsOutsideAllowedList.join(", ")}`,
      });
    }
  }

  return issues;
}

async function fetchAllPlaces(
  supabase: SupabaseClientForScript
): Promise<PlaceRow[]> {
  const pageSize = 1000;
  const rows: PlaceRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("places")
      .select(
        "id,title,description,address,city,city_name_cached,kind,categories,tags,access_level,is_hidden,visibility"
      )
      .range(from, to);

    if (error) throw error;

    const page = (data ?? []) as PlaceRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function fetchTags(
  supabase: SupabaseClientForScript
): Promise<TagRow[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("id,name,category_ids,emoji")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TagRow[];
}

async function main(): Promise<void> {
  const envFile = readEnvFile(path.join(root, ".env.local"));
  const supabaseUrl = assertEnv(envFile, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = assertEnv(envFile, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnvValue(envFile, "SUPABASE_SERVICE_ROLE_KEY");

  if (apply && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when using --apply.");
  }

  const supabase = createSupabaseClient(
    supabaseUrl,
    apply ? serviceRoleKey! : anonKey
  );

  const allPlaces = await fetchAllPlaces(supabase);
  const visiblePlaces = allPlaces.filter(isVisible);
  const tagRows = await fetchTags(supabase);
  const tagNames = new Set(tagRows.map((tag) => tag.name));

  const placeTagFixes: PlaceTagFix[] = visiblePlaces
    .map((place) => ({
      id: place.id,
      title: titleOf(place),
      before: place.tags ?? [],
      after: normalizeTags(place.tags),
    }))
    .filter((fix) => !arraysEqual(fix.before, fix.after));

  const tagRenames: TagRename[] = tagRows
    .filter((tag) => TAG_RENAMES[tag.name])
    .map((tag) => {
      const after = TAG_RENAMES[tag.name]!;
      return {
        id: tag.id,
        before: tag.name,
        after,
        status: tagNames.has(after) ? "target-exists" : "ready",
      };
    });

  if (apply) {
    for (const fix of placeTagFixes) {
      const { error } = await supabase
        .from("places")
        .update({ tags: fix.after })
        .eq("id", fix.id);

      if (error) throw error;
    }

    for (const rename of tagRenames.filter((item) => item.status === "ready")) {
      const { error } = await supabase
        .from("tags")
        .update({ name: rename.after })
        .eq("id", rename.id);

      if (error) throw error;
    }
  }

  const issues = findIssues(visiblePlaces, tagNames);
  const allPlaceIssues = findIssues(allPlaces, tagNames);
  const missingTags = issues.filter((issue) => issue.reason === "missing tags");
  const missingCategories = issues.filter(
    (issue) => issue.reason === "missing categories"
  );
  const categoryMismatches = issues.filter((issue) =>
    issue.reason.startsWith("category not allowed")
  );
  const unknownKinds = issues.filter((issue) => issue.reason === "unknown kind");
  const tagsOutsideAllowedList = issues.filter((issue) =>
    issue.reason.startsWith("tags outside allowed list")
  );
  const allTagsOutsideAllowedList = allPlaceIssues.filter((issue) =>
    issue.reason.startsWith("tags outside allowed list")
  );

  const kindCounts = visiblePlaces.reduce<Record<string, number>>((acc, place) => {
    const kind = place.kind ?? "unknown";
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Visible places: ${visiblePlaces.length}`);
  console.log(`Kinds: ${JSON.stringify(kindCounts)}`);
  console.log(`Place tag fixes ${apply ? "applied" : "planned"}: ${placeTagFixes.length}`);
  console.log(
    `Tag table renames ${apply ? "applied" : "planned"}: ${
      tagRenames.filter((rename) => rename.status === "ready").length
    }`
  );
  console.log(
    `Tag table renames skipped because target exists: ${
      tagRenames.filter((rename) => rename.status === "target-exists").length
    }`
  );
  console.log(`Missing categories: ${missingCategories.length}`);
  console.log(`Missing tags: ${missingTags.length}`);
  console.log(`Category/kind mismatches: ${categoryMismatches.length}`);
  console.log(`Unknown kinds: ${unknownKinds.length}`);
  console.log(`Tags outside allowed list: ${tagsOutsideAllowedList.length}`);
  console.log(`Tags outside allowed list (all places): ${allTagsOutsideAllowedList.length}`);

  if (placeTagFixes.length > 0) {
    console.log("\nPlace tag fixes:");
    for (const fix of placeTagFixes) {
      console.log(`- ${fix.title}: ${fix.before.join(", ")} -> ${fix.after.join(", ")}`);
    }
  }

  if (tagRenames.length > 0) {
    console.log("\nTag table renames:");
    for (const rename of tagRenames) {
      console.log(`- ${rename.before} -> ${rename.after} (${rename.status})`);
    }
  }

  const reviewIssues = [
    ...missingCategories,
    ...missingTags,
    ...tagsOutsideAllowedList,
  ].slice(0, 40);
  if (reviewIssues.length > 0) {
    console.log("\nReview candidates:");
    for (const issue of reviewIssues) {
      console.log(`- ${issue.title} [${issue.kind}]: ${issue.reason}`);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
