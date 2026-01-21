"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  created_at: string;
};

type ActivityItem =
  | { type: "liked"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null }
  | { type: "commented"; created_at: string; placeId: string; placeTitle?: string | null; commentText?: string | null; coverUrl?: string | null; address?: string | null }
  | { type: "added"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null };

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

function initialsFromEmail(email?: string | null) {
  if (!email) return "U";
  const name = email.split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (daysAgo === 0) return `today · ${timeStr}`;
  if (daysAgo === 1) return `1 day ago · ${timeStr}`;
  return `${daysAgo} days ago · ${timeStr}`;
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function ProfileInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"added" | "saved" | "activity">("activity");
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);

  const [saved, setSaved] = useState<Place[]>([]);
  const [added, setAdded] = useState<Place[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(0);

  const stats = useMemo(() => ({
    addedCount: added.length,
    savedCount: saved.length,
    commentsCount: commentsCount,
  }), [added, saved, commentsCount]);

  const activeList = useMemo(() => {
    if (tab === "added") return added;
    if (tab === "saved") return saved;
    return [];
  }, [tab, added, saved]);

  // settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editProcessedRef = useRef(false);

  // Открываем модальное окно редактирования, если в URL есть параметр edit=true
  useEffect(() => {
    const editParam = searchParams?.get("edit");
    if (editParam === "true" && !editProcessedRef.current) {
      editProcessedRef.current = true;
      setSettingsOpen(true);
      // Убираем параметр из URL без перезагрузки страницы
      router.replace("/profile", { scroll: false });
    } else if (editParam !== "true") {
      // Сбрасываем флаг, если параметр был удален
      editProcessedRef.current = false;
    }
  }, [searchParams, router]);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!mounted) return;

      if (!session?.user) {
        router.replace("/auth");
        return;
      }

      const user = session.user;
      setUserId(user.id);
      setUserEmail(user.email ?? null);

      // profile
      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profError) {
        console.error("Error loading profile:", profError);
      }

      if (mounted) {
        setProfile((prof as Profile) ?? null);
        setDisplayNameDraft((prof as any)?.display_name ?? (user.email ?? ""));
        setBioDraft((prof as any)?.bio ?? "");
        setAvatarDraft((prof as any)?.avatar_url ?? null);
      }

      // reactions (likes/saved)
      const { data: reactions } = await supabase
        .from("reactions")
        .select("place_id, reaction, created_at")
        .eq("user_id", user.id)
        .eq("reaction", "like");

      const placeIds = (reactions ?? []).map((r: any) => r.place_id);

      let savedPlaces: Place[] = [];
      if (placeIds.length) {
        const { data } = await supabase
          .from("places")
          .select("id,title,city,country,address,cover_url,created_at")
          .in("id", placeIds)
          .order("created_at", { ascending: false });
        savedPlaces = (data ?? []) as Place[];
      }
      if (mounted) setSaved(savedPlaces);

      // Count comments
      const { count: commentsCountData } = await supabase
        .from("comments")
        .select("*", { count: 'exact', head: true })
        .eq("user_id", user.id);
      
      if (mounted) setCommentsCount(commentsCountData || 0);

      // added places
      const { data: addedPlaces } = await supabase
        .from("places")
        .select("id,title,city,country,address,cover_url,created_at")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (mounted) setAdded((addedPlaces ?? []) as Place[]);

      // activity
      const likesAct: ActivityItem[] = (reactions ?? []).map((r: any) => ({
        type: "liked",
        created_at: r.created_at,
        placeId: r.place_id,
      }));

      const { data: comments } = await supabase
        .from("comments")
        .select("place_id, created_at, text")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      const commentsAct: ActivityItem[] = (comments ?? []).map((c: any) => ({
        type: "commented",
        created_at: c.created_at,
        placeId: c.place_id,
        commentText: c.text,
      }));

      const addedAct: ActivityItem[] = ((addedPlaces ?? []) as any[]).map((p) => ({
        type: "added",
        created_at: p.created_at,
        placeId: p.id,
      }));

      const act = [...likesAct, ...commentsAct, ...addedAct].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const actPlaceIds = Array.from(new Set(act.map((a) => a.placeId)));
      const placesMap = new Map<string, { title: string; cover_url: string | null; address: string | null }>();

      if (actPlaceIds.length) {
        const { data: ps } = await supabase.from("places").select("id,title,cover_url,address").in("id", actPlaceIds);
        (ps ?? []).forEach((p: any) => placesMap.set(p.id, { title: p.title, cover_url: p.cover_url, address: p.address }));
      }

      const actWithTitles = act.map((a) => {
        const place = placesMap.get(a.placeId);
        return {
          ...a,
          placeTitle: place?.title ?? "Place",
          ...(a.type === "added" || a.type === "liked" || a.type === "commented" ? { coverUrl: place?.cover_url ?? null, address: place?.address ?? null } : {}),
        };
      });

      if (mounted) setActivity(actWithTitles);
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function removeFavorite(placeId: string) {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("place_id", placeId)
        .eq("user_id", userId)
        .eq("reaction", "like");

      if (error) {
        console.error("Error removing favorite:", error);
        alert("Failed to remove from favorites: " + (error.message || "Unknown error"));
        return;
      }

      // Обновляем список избранного
      setSaved((prev) => prev.filter((p) => p.id !== placeId));

      // Обновляем активность
      setActivity((prev) => prev.filter((a) => !(a.type === "liked" && a.placeId === placeId)));
    } catch (err) {
      console.error("Remove favorite error:", err);
      alert("An error occurred. Please try again.");
    }
  }

  async function uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      // Path should be relative to bucket: userId/uuid.jpg (without "avatars/" prefix)
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        console.error("Upload error:", error);
        return { url: null, error: error.message || "Upload failed" };
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return { url: data.publicUrl ?? null, error: null };
    } catch (err) {
      console.error("Upload exception:", err);
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      return { url: null, error: errorMessage };
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB");
      return;
    }

    setAvatarUploading(true);

    // Delete old avatar if exists (check path, not id)
    if (avatarDraft && avatarDraft.includes("avatars/")) {
      // Extract path from URL: avatars/{userId}/{uuid}.jpg
      const pathMatch = avatarDraft.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0]; // Remove query params if any
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    const result = await uploadAvatar(file);
    setAvatarUploading(false);

    if (result.url) {
      setAvatarDraft(result.url);
      
      // Update profile immediately (using upsert for safety)
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { id: userId, avatar_url: result.url },
          { onConflict: "id" }
        );

      if (!error) {
        setProfile((p) => (p ? { ...p, avatar_url: result.url } : p));
      }
    } else {
      alert(result.error || "Failed to upload avatar");
    }

    // Reset input
    e.target.value = "";
  }

  async function deleteAvatar() {
    if (!userId || !avatarDraft) return;

    // Delete from storage (check path, not id)
    if (avatarDraft.includes("avatars/")) {
      // Extract path from URL: avatars/{userId}/{uuid}.jpg
      const pathMatch = avatarDraft.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0]; // Remove query params if any
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    // Update profile (using upsert for safety)
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: userId, avatar_url: null },
        { onConflict: "id" }
      );

    if (!error) {
      setAvatarDraft(null);
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
    }
  }

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);

    // Use upsert for safety (create if doesn't exist, update if exists)
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: displayNameDraft,
          bio: bioDraft,
          avatar_url: avatarDraft,
        },
        { onConflict: "id" }
      );

    setSaving(false);

    if (!error) {
      setProfile((p) =>
        p
          ? { ...p, display_name: displayNameDraft, bio: bioDraft, avatar_url: avatarDraft }
          : ({
              id: userId,
              username: null,
              display_name: displayNameDraft,
              bio: bioDraft,
              avatar_url: avatarDraft,
            } as Profile)
      );
      setSettingsOpen(false);
    }
  }

  const displayName =
    profile?.display_name || profile?.username || userEmail || "User";

  // Get location from profile or use default
  const userLocation = profile?.bio ? null : null; // TODO: Add location field to profile if needed

  return (
    <main className="min-h-screen bg-white">
      <TopBar
        showSearchBar={true}
        searchValue={""}
        onSearchChange={(value) => {
          const params = new URLSearchParams();
          if (value) params.set("q", value);
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={null}
        onCityChange={(city) => {
          const params = new URLSearchParams();
          if (city) params.set("city", city);
          router.push(`/map?${params.toString()}`);
        }}
        onFiltersClick={() => router.push("/map")}
        activeFiltersCount={0}
        userAvatar={profile?.avatar_url ?? null}
        userDisplayName={displayName}
        userEmail={userEmail}
      />

      <div className="pt-[64px] min-[600px]:pt-[80px]">
        {/* Mobile: Hero Card */}
        <div className="min-[900px]:hidden">
          <div className="mx-auto max-w-md px-4 pt-6 pb-4">
            {/* Hero Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
              <div className="flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="h-24 w-24 rounded-full bg-[#f5f4f2] border-2 border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 mb-4">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-semibold text-[#6b7d47]">{initialsFromName(displayName)}</span>
                  )}
                </div>

                {/* Name */}
                <h1 className="text-2xl font-semibold text-[#2d2d2d] mb-2">{displayName}</h1>

                {/* Location - пока не реализовано, можно добавить позже */}
                {/* {userLocation && (
                  <div className="text-sm text-gray-600 mb-3">{userLocation}</div>
                )} */}

                {/* Bio */}
                {profile?.bio ? (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-4">{profile.bio}</p>
                ) : (
                  <p className="text-sm text-gray-400 mb-4">No bio yet</p>
                )}

                {/* Edit Button */}
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-[#2d2d2d] hover:bg-gray-50 transition"
                >
                  Edit profile
                </button>
              </div>
            </div>

            {/* Stats Row - Mobile */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              <button
                onClick={() => setTab("added")}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:bg-gray-50 transition active:scale-[0.98]"
              >
                <div className="text-2xl font-semibold text-[#2d2d2d] mb-1">{stats.addedCount}</div>
                <div className="text-xs text-gray-600">Places added</div>
              </button>
              <button
                onClick={() => setTab("saved")}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:bg-gray-50 transition active:scale-[0.98]"
              >
                <div className="text-2xl font-semibold text-[#2d2d2d] mb-1">{stats.savedCount}</div>
                <div className="text-xs text-gray-600">Places saved</div>
              </button>
              <button
                onClick={() => setTab("activity")}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:bg-gray-50 transition active:scale-[0.98]"
              >
                <div className="text-2xl font-semibold text-[#2d2d2d] mb-1">{stats.commentsCount}</div>
                <div className="text-xs text-gray-600">Comments</div>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop: Hero Section */}
        <div className="hidden min-[900px]:block">
          <div className="mx-auto max-w-7xl px-8 pt-8 pb-6">
            <div className="flex items-start gap-6 mb-6">
              {/* Avatar */}
              <div className="h-32 w-32 rounded-full bg-[#f5f4f2] border-2 border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl font-semibold text-[#6b7d47]">{initialsFromName(displayName)}</span>
                )}
              </div>

              {/* Name, Location, Bio */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h1 className="text-3xl font-semibold text-[#2d2d2d] mb-2">{displayName}</h1>
                    {/* Stats - Desktop inline */}
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <button
                        onClick={() => setTab("added")}
                        className="hover:text-[#2d2d2d] transition cursor-pointer"
                      >
                        <span className="font-semibold">{stats.addedCount}</span> places added
                      </button>
                      <button
                        onClick={() => setTab("saved")}
                        className="hover:text-[#2d2d2d] transition cursor-pointer"
                      >
                        <span className="font-semibold">{stats.savedCount}</span> places saved
                      </button>
                      <button
                        onClick={() => setTab("activity")}
                        className="hover:text-[#2d2d2d] transition cursor-pointer"
                      >
                        <span className="font-semibold">{stats.commentsCount}</span> comments
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-[#2d2d2d] hover:bg-gray-50 transition"
                  >
                    Edit profile
                  </button>
                </div>
                {profile?.bio && (
                  <p className="text-base text-gray-600 max-w-2xl">{profile.bio}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Content */}
      <div className="mx-auto max-w-md min-[900px]:max-w-7xl px-4 min-[900px]:px-8 pb-20">
        {/* Sticky Tabs */}
        <div className="sticky top-[64px] min-[600px]:top-[80px] z-30 bg-white border-b border-gray-200 mb-6 -mx-4 min-[900px]:-mx-8 px-4 min-[900px]:px-8">
          <div className="flex">
            <button
              onClick={() => setTab("activity")}
              className={cx(
                "px-4 py-4 text-sm font-medium transition flex-shrink-0 relative -mb-px",
                tab === "activity"
                  ? "text-[#2d2d2d]"
                  : "text-gray-600 hover:text-[#2d2d2d]"
              )}
            >
              Activity
              {tab === "activity" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2d2d2d] transition-all duration-200" />
              )}
            </button>
            <button
              onClick={() => setTab("added")}
              className={cx(
                "px-4 py-4 text-sm font-medium transition flex-shrink-0 relative -mb-px",
                tab === "added"
                  ? "text-[#2d2d2d]"
                  : "text-gray-600 hover:text-[#2d2d2d]"
              )}
            >
              Added
              {tab === "added" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2d2d2d] transition-all duration-200" />
              )}
            </button>
            <button
              onClick={() => setTab("saved")}
              className={cx(
                "px-4 py-4 text-sm font-medium transition flex-shrink-0 relative -mb-px",
                tab === "saved"
                  ? "text-[#2d2d2d]"
                  : "text-gray-600 hover:text-[#2d2d2d]"
              )}
            >
              Saved
              {tab === "saved" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2d2d2d] transition-all duration-200" />
              )}
            </button>
          </div>
        </div>

        <div className="transition-opacity duration-200">
          {loading ? (
            <Empty text="Loading…" />
          ) : tab === "activity" ? (
            activity.length === 0 ? (
              <Empty text="No activity yet" />
            ) : (
              <div className="space-y-0">
                {activity.slice(0, 50).map((a, idx) => (
                  <ActivityCard
                    key={`${a.type}-${a.placeId}-${idx}`}
                    item={a}
                    userAvatar={profile?.avatar_url ?? null}
                    userName={displayName}
                  />
                ))}
              </div>
            )
          ) : activeList.length === 0 ? (
            <Empty
              text={
                tab === "saved"
                  ? "Save places to find them later"
                  : "You haven't added places yet"
              }
            />
          ) : (
            <div className="grid grid-cols-2 min-[900px]:grid-cols-3 min-[1120px]:grid-cols-4 gap-4 min-[900px]:gap-6">
              {activeList.map((p) => (
                <Link
                  key={p.id}
                  href={`/id/${p.id}`}
                  className="group"
                >
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-2">
                    {p.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.cover_url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {tab === "saved" && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          await removeFavorite(p.id);
                        }}
                        className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 hover:bg-white flex items-center justify-center transition shadow-sm"
                        aria-label="Remove from favorites"
                        title="Remove from favorites"
                      >
                        <svg
                          className="w-4 h-4 text-[#6b7d47]"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-[#2d2d2d] mb-1 line-clamp-1">{p.title}</h3>
                    {p.city && (
                      <p className="text-xs text-gray-600">{p.city}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close"
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-[#6b7d47]/10 max-h-[80vh] overflow-y-auto">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-6">
                <div className="text-lg font-semibold text-[#2d2d2d]">Edit profile</div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="h-9 w-9 rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] hover:bg-[#6b7d47]/10 text-[#6b7d47] transition flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Avatar Section */}
                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Avatar</label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 rounded-2xl bg-[#f5f4f2] border border-[#6b7d47]/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {avatarDraft ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarDraft} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-semibold text-[#6b7d47]">{initialsFromEmail(userEmail)}</span>
                      )}
                      {avatarUploading && (
                        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center z-10">
                          <div className="text-white text-xs">Uploading…</div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="cursor-pointer block">
                        <span className="inline-flex items-center justify-center rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-2 text-xs font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition active:scale-[0.98]">
                          {avatarDraft ? "Change" : "Upload"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                          disabled={avatarUploading}
                        />
                      </label>
                      {avatarDraft && (
                        <button
                          type="button"
                          onClick={deleteAvatar}
                          disabled={avatarUploading}
                          className="text-xs text-red-600 hover:text-red-700 transition disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Display name</label>
                  <input
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition"
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Bio</label>
                  <textarea
                    className="w-full min-h-[110px] rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition resize-none"
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    placeholder="Short description…"
                  />
                </div>
              </div>

              <button
                onClick={saveProfile}
                disabled={saving}
                className="mt-6 w-full rounded-xl bg-[#6b7d47] text-white py-3 font-medium hover:bg-[#556036] disabled:opacity-60 transition active:scale-[0.98]"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function ActivityCard({ item, userAvatar, userName }: { item: ActivityItem; userAvatar: string | null; userName: string }) {
  const getIcon = () => {
    const iconClass = "w-5 h-5";
    if (item.type === "liked") {
      return (
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
          <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24" style={{ color: "#ef4444" }}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      );
    }
    if (item.type === "commented") {
      return (
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#3b82f6" }}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#6b7d47" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
    );
  };

  const getActionText = () => {
    if (item.type === "liked") return "Liked a place";
    if (item.type === "commented") return "Commented on a place";
    return "Added a place";
  };

  return (
    <Link
      href={`/id/${item.placeId}`}
      className="block py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition min-[900px]:py-5"
    >
      <div className="flex items-start gap-4">
        {/* Action Icon */}
        {getIcon()}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Action text + timestamp */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm font-medium text-[#2d2d2d]">{getActionText()}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(item.created_at)}</span>
          </div>

          {/* Comment text (if commented) */}
          {item.type === "commented" && item.commentText && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.commentText}</p>
          )}

          {/* Place preview */}
          <div className="flex items-center gap-3">
            {item.coverUrl ? (
              <div className="w-16 h-16 min-[900px]:w-20 min-[900px]:h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverUrl}
                  alt={item.placeTitle ?? "Place"}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 min-[900px]:w-20 min-[900px]:h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-[#2d2d2d] mb-1 line-clamp-1">
                {item.placeTitle ?? "Place"}
              </h3>
              {item.address && (
                <p className="text-xs text-gray-500 line-clamp-1">{item.address}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}


function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-sm text-[#6b7d47]/60">{text}</div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="text-sm text-[#6b7d47]/60">Loading…</div>
      </main>
    }>
      <ProfileInner />
    </Suspense>
  );
}