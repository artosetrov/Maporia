import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import type { Database } from "../types/supabase";
import { isValidPlaceSlug } from "../lib/placeSlugs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };
type SlugPlaceRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "id" | "visibility" | "is_hidden" | "access_level" | "is_premium"
>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const serverSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-client-info": "maporia-slug-route" } },
      })
    : null;

// SectionErrorBoundary: this route renders no UI; errors resolve through notFound/redirect boundaries.
export default async function PlaceSlugPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isValidPlaceSlug(slug) || !serverSupabase) notFound();

  const { data, error } = (await serverSupabase
    .from("places")
    .select("id,visibility,is_hidden,access_level,is_premium")
    .eq("slug", slug)
    .maybeSingle()) as { data: SlugPlaceRow | null; error: unknown | null };

  if (error || !data || data.is_hidden === true || data.visibility === "hidden" || data.visibility === "private") {
    notFound();
  }

  redirect(`/id/${data.id}`);
}
