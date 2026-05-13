import { supabase } from "./supabase";

type ProfilePatch = {
  avatar_url?: string | null;
  display_name?: string | null;
  bio?: string | null;
  username?: string | null;
  favorite_categories?: string[] | null;
  favorite_tags?: string[] | null;
};

export async function updateOwnProfile(patch: ProfilePatch): Promise<{ error: string | null }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return { error: "Unable to get current session" };
  }

  try {
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(patch),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      return { error: message };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" };
  }
}
