"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { supabase } from "../lib/supabase";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  created_at: string;
};

type Review = {
  id: string;
  text: string;
  created_at: string;
  place_id: string;
  place_title: string | null;
  place_address: string | null;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_avatar: string | null;
  reviewer_location: string | null;
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

function formatDate(date: Date): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getYearsSince(date: Date): number {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365));
  return diffYears;
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

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function ProfileInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [section, setSection] = useState<"about" | "trips" | "added" | "activity">("about");
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);

  const [added, setAdded] = useState<Place[]>([]);
  const [saved, setSaved] = useState<Place[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [reviewsReceived, setReviewsReceived] = useState<Review[]>([]);
  const [reviewsWritten, setReviewsWritten] = useState<Review[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const stats = useMemo(() => {
    return {
      placesAdded: added.length,
      reviews: commentsCount,
      favoritesCount: saved.length,
    };
  }, [added, commentsCount, saved]);

  // settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editProcessedRef = useRef(false);

  useEffect(() => {
    const editParam = searchParams?.get("edit");
    if (editParam === "true" && !editProcessedRef.current) {
      editProcessedRef.current = true;
      setSettingsOpen(true);
      router.replace("/profile", { scroll: false });
    } else if (editParam !== "true") {
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
      setUserCreatedAt(user.created_at ?? null);

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

      // added places
      const { data: addedPlaces } = await supabase
        .from("places")
        .select("id,title,city,country,address,cover_url,created_at")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (mounted) setAdded((addedPlaces ?? []) as Place[]);

      // saved places
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

      // Count comments written
      const { count: commentsCountData } = await supabase
        .from("comments")
        .select("*", { count: 'exact', head: true })
        .eq("user_id", user.id);
      
      if (mounted) setCommentsCount(commentsCountData || 0);

      // Get reviews written by user
      const { data: commentsWritten } = await supabase
        .from("comments")
        .select("id, text, created_at, place_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      // Get reviews received (comments on user's places)
      const addedPlaceIds = (addedPlaces ?? []).map((p: any) => p.id);
      let reviewsReceivedData: Review[] = [];
      
      if (addedPlaceIds.length > 0) {
        const { data: commentsReceived } = await supabase
          .from("comments")
          .select("id, text, created_at, place_id, user_id")
          .in("place_id", addedPlaceIds)
          .neq("user_id", user.id) // Exclude user's own comments
          .order("created_at", { ascending: false })
          .limit(20);

        if (commentsReceived && commentsReceived.length > 0) {
          const reviewerIds = Array.from(new Set(commentsReceived.map((c: any) => c.user_id)));
          const placeIdsForReviews = Array.from(new Set(commentsReceived.map((c: any) => c.place_id)));

          const [profilesData, placesData] = await Promise.all([
            supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", reviewerIds),
            supabase.from("places").select("id, title, address").in("id", placeIdsForReviews),
          ]);

          const profilesMap = new Map();
          (profilesData.data ?? []).forEach((p: any) => {
            profilesMap.set(p.id, {
              name: p.display_name || p.username || "User",
              avatar: p.avatar_url,
            });
          });

          const placesMap = new Map();
          (placesData.data ?? []).forEach((p: any) => {
            placesMap.set(p.id, {
              title: p.title,
              address: p.address,
            });
          });

          reviewsReceivedData = (commentsReceived ?? []).map((c: any) => {
            const reviewer = profilesMap.get(c.user_id);
            const place = placesMap.get(c.place_id);
            return {
              id: c.id,
              text: c.text,
              created_at: c.created_at,
              place_id: c.place_id,
              place_title: place?.title ?? null,
              place_address: place?.address ?? null,
              reviewer_id: c.user_id,
              reviewer_name: reviewer?.name ?? "User",
              reviewer_avatar: reviewer?.avatar ?? null,
              reviewer_location: null, // TODO: Add location to profile if needed
            };
          });
        }
      }

      // Process reviews written
      let reviewsWrittenData: Review[] = [];
      if (commentsWritten && commentsWritten.length > 0) {
        const placeIdsForWritten = Array.from(new Set(commentsWritten.map((c: any) => c.place_id)));
        const { data: placesData } = await supabase
          .from("places")
          .select("id, title, address, created_by")
          .in("id", placeIdsForWritten);

        const placesMap = new Map();
        (placesData ?? []).forEach((p: any) => {
          placesMap.set(p.id, {
            title: p.title,
            address: p.address,
          });
        });

        const currentDisplayName = (prof as any)?.display_name || (prof as any)?.username || user.email || "User";
        const currentAvatar = (prof as any)?.avatar_url ?? null;

        reviewsWrittenData = (commentsWritten ?? []).map((c: any) => {
          const place = placesMap.get(c.place_id);
          return {
            id: c.id,
            text: c.text,
            created_at: c.created_at,
            place_id: c.place_id,
            place_title: place?.title ?? null,
            place_address: place?.address ?? null,
            reviewer_id: user.id,
            reviewer_name: currentDisplayName,
            reviewer_avatar: currentAvatar,
            reviewer_location: null,
          };
        });
      }

      // Load activity
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

      if (mounted) {
        setReviewsReceived(reviewsReceivedData);
        setReviewsWritten(reviewsWrittenData);
        setActivity(actWithTitles);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
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

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB");
      return;
    }

    setAvatarUploading(true);

    if (avatarDraft && avatarDraft.includes("avatars/")) {
      const pathMatch = avatarDraft.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0];
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    const result = await uploadAvatar(file);
    setAvatarUploading(false);

    if (result.url) {
      setAvatarDraft(result.url);
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, avatar_url: result.url }, { onConflict: "id" });

      if (!error) {
        setProfile((p) => (p ? { ...p, avatar_url: result.url } : p));
      }
    } else {
      alert(result.error || "Failed to upload avatar");
    }

    e.target.value = "";
  }

  async function deleteAvatar() {
    if (!userId || !avatarDraft) return;

    if (avatarDraft.includes("avatars/")) {
      const pathMatch = avatarDraft.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0];
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, avatar_url: null }, { onConflict: "id" });

    if (!error) {
      setAvatarDraft(null);
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
    }
  }

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);

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

  const displayName = profile?.display_name || profile?.username || userEmail || "User";

  // Extract "My work" from bio if it exists (format: "My work: ...")
  const bioParts = profile?.bio?.split(/My work:/i) || [];
  const myWork = bioParts.length > 1 ? bioParts[1].trim() : null;
  const bioWithoutWork = bioParts[0]?.trim() || null;

  return (
    <main className="min-h-screen bg-white">
      <TopBar
        showSearchBar={false}
        searchValue={""}
        onSearchChange={() => {}}
        selectedCity={null}
        onCityChange={() => {}}
        onFiltersClick={() => {}}
        activeFiltersCount={0}
        userAvatar={profile?.avatar_url ?? null}
        userDisplayName={displayName}
        userEmail={userEmail}
        showBackButton={section !== "about"}
        showAddPlaceButton={true}
        onBackClick={() => {
          setSection("about");
          router.replace("/profile", { scroll: false });
        }}
      />

      <div className="pt-[64px] min-[900px]:pt-[80px]">
        {/* Desktop Layout */}
        <div className="hidden min-[900px]:flex min-h-[calc(100vh-80px)]">
          {/* Left Sidebar */}
          <aside className="w-64 border-r border-gray-200 bg-white flex-shrink-0">
            <div className="sticky top-[80px] p-6">
              <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Profile</h2>
              <nav className="space-y-1">
                <button
                  onClick={() => setSection("about")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "about"
                      ? "bg-gray-100 text-[#2d2d2d] font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-xs font-semibold text-gray-600">{initialsFromName(displayName)}</span>
                    )}
                  </div>
                  <span>About me</span>
                </button>
                <button
                  onClick={() => setSection("trips")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "trips"
                      ? "bg-gray-100 text-[#2d2d2d] font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span>My favorites</span>
                </button>
                <button
                  onClick={() => setSection("added")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "added"
                      ? "bg-gray-100 text-[#2d2d2d] font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Added places</span>
                </button>
                <button
                  onClick={() => setSection("activity")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "activity"
                      ? "bg-gray-100 text-[#2d2d2d] font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Activity</span>
                </button>
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-8 py-8">
              {section === "about" && (
                <AboutSection
                  profile={profile}
                  displayName={displayName}
                  stats={stats}
                  myWork={myWork}
                  bio={bioWithoutWork}
                  reviewsReceived={reviewsReceived}
                  reviewsWritten={reviewsWritten}
                  onEditClick={() => setSettingsOpen(true)}
                  loading={loading}
                />
              )}
              {section === "trips" && (
                <TripsSection places={saved} loading={loading} />
              )}
              {section === "added" && (
                <AddedPlacesSection places={added} loading={loading} />
              )}
              {section === "activity" && (
                <ActivitySection activity={activity} loading={loading} profile={profile} displayName={displayName} />
              )}
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="min-[900px]:hidden">
          {section === "trips" || section === "added" || section === "activity" ? (
            // Show section content on mobile
            <div className="px-6 py-6">
              {section === "trips" && (
                <TripsSection places={saved} loading={loading} />
              )}
              {section === "added" && (
                <AddedPlacesSection places={added} loading={loading} />
              )}
              {section === "activity" && (
                <div>
                  <button
                    onClick={() => {
                      setSection("about");
                      router.replace("/profile", { scroll: false });
                    }}
                    className="mb-4 flex items-center gap-2 text-gray-600 hover:text-[#2d2d2d] transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <ActivitySection activity={activity} loading={loading} profile={profile} displayName={displayName} />
                </div>
              )}
            </div>
          ) : (
            // Show main mobile dashboard
            <div className="px-6 py-6 space-y-4">
              {loading ? (
                <div className="text-center py-16 text-gray-500">Loading…</div>
              ) : (
                <>
                  {/* Profile Hero Card */}
                  <div className="bg-white rounded-[24px] p-6 border border-gray-200 shadow-sm" style={{ minHeight: '140px' }}>
                    <div className="flex items-center gap-6 h-full">
                      {/* Left: Avatar, Name, Location (≈ 60%) */}
                      <div className="flex-shrink-0" style={{ width: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        {/* Avatar */}
                        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden" style={{ marginBottom: '10px' }}>
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-2xl font-semibold text-gray-600">{initialsFromName(displayName)}</span>
                          )}
                        </div>
                        {/* Name */}
                        <h1 className="text-[#2d2d2d] leading-tight m-0 text-center" style={{ fontWeight: 600, fontSize: '22px' }}>{displayName}</h1>
                        {/* Location */}
                        <div className="text-gray-500 leading-tight m-0 text-center" style={{ fontSize: '14px', marginTop: '4px', color: '#6b7280' }}>
                          {/* Location will be shown here when available in profile */}
                        </div>
                      </div>

                      {/* Right: Stats (≈ 40%) */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ width: '40%' }}>
                        <div className="space-y-0">
                          <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                            <div className="text-[#2d2d2d] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.placesAdded}</div>
                            <div className="m-0" style={{ fontSize: '13px', color: '#6b7280', marginTop: '1px', lineHeight: '1.1' }}>Places added</div>
                          </div>
                          <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                            <div className="text-[#2d2d2d] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.reviews}</div>
                            <div className="m-0" style={{ fontSize: '13px', color: '#6b7280', marginTop: '1px', lineHeight: '1.1' }}>Comments</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                            <div className="text-[#2d2d2d] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.favoritesCount}</div>
                            <div className="m-0" style={{ fontSize: '13px', color: '#6b7280', marginTop: '1px', lineHeight: '1.1' }}>My favorites</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Access Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* My favorites */}
                    <button
                      onClick={() => setSection("trips")}
                      className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition group"
                    >
                      <div className="aspect-[4/3] rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
                        {saved.length > 0 ? (
                          <div className="relative w-full h-full" style={{ padding: '8px' }}>
                            {/* Display up to 2 overlapping, rotated images */}
                            {saved.slice(0, 2).map((place, index) => {
                              const rotation = index === 0 ? -5 : 5; // First image rotates left, second rotates right
                              const offsetX = index === 0 ? -8 : 8; // First image offset left, second offset right
                              const offsetY = index === 0 ? 0 : -5; // Second image offset up
                              const zIndex = saved.length - index; // First image on top
                              
                              return place.cover_url ? (
                                <div
                                  key={place.id}
                                  className="absolute rounded-lg overflow-hidden shadow-lg border-2 border-white"
                                  style={{
                                    width: '50%',
                                    height: '50%',
                                    transform: `translateX(-50%) translateY(-50%) rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px)`,
                                    transformOrigin: 'center center',
                                    zIndex: zIndex,
                                    left: '50%',
                                    top: '50%',
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={place.cover_url}
                                    alt={place.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : null;
                            })}
                            {/* Show count badge if more than 2 images */}
                            {saved.length > 2 && (
                              <div 
                                className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-gray-700 badge-shadow z-10"
                                style={{ zIndex: 10 }}
                              >
                                +{saved.length - 2}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#2d2d2d] text-center">My favorites</div>
                    </button>

                    {/* Added places */}
                    <button
                      onClick={() => setSection("added")}
                      className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition group"
                    >
                      <div className="aspect-[4/3] rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
                        {added.length > 0 ? (
                          <div className="relative w-full h-full" style={{ padding: '8px' }}>
                            {/* Display up to 2 overlapping, rotated images */}
                            {added.slice(0, 2).map((place, index) => {
                              const rotation = index === 0 ? -5 : 5; // First image rotates left, second rotates right
                              const offsetX = index === 0 ? -8 : 8; // First image offset left, second offset right
                              const offsetY = index === 0 ? 0 : -5; // Second image offset up
                              const zIndex = added.length - index; // First image on top
                              
                              return place.cover_url ? (
                                <div
                                  key={place.id}
                                  className="absolute rounded-lg overflow-hidden shadow-lg border-2 border-white"
                                  style={{
                                    width: '50%',
                                    height: '50%',
                                    transform: `translateX(-50%) translateY(-50%) rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px)`,
                                    transformOrigin: 'center center',
                                    zIndex: zIndex,
                                    left: '50%',
                                    top: '50%',
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={place.cover_url}
                                    alt={place.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : null;
                            })}
                            {/* Show count badge if more than 2 images */}
                            {added.length > 2 && (
                              <div 
                                className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-gray-700 badge-shadow z-10"
                                style={{ zIndex: 10 }}
                              >
                                +{added.length - 2}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#2d2d2d] text-center">Added places</div>
                    </button>
                  </div>

                  {/* Activity Card */}
                  <button
                    onClick={() => setSection("activity")}
                    className="w-full py-4 transition text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-[#2d2d2d] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-[#2d2d2d]">Activity</div>
                          <div className="text-xs text-gray-500">View your recent activity</div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Edit profile button */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="w-full py-4 transition text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-[#2d2d2d] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-[#2d2d2d]">Edit profile</div>
                          <div className="text-xs text-gray-500">Update your information</div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
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

function AboutSection({
  profile,
  displayName,
  stats,
  myWork,
  bio,
  reviewsReceived,
  reviewsWritten,
  onEditClick,
  loading,
  mobile = false,
}: {
  profile: Profile | null;
  displayName: string;
  stats: { placesAdded: number; reviews: number; favoritesCount: number };
  myWork: string | null;
  bio: string | null;
  reviewsReceived: Review[];
  reviewsWritten: Review[];
  onEditClick: () => void;
  loading: boolean;
  mobile?: boolean;
}) {
  if (loading) {
    return <div className="text-center py-16 text-gray-500">Loading…</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold text-[#2d2d2d]">About me</h1>
        <button
          onClick={onEditClick}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-[#2d2d2d] hover:bg-gray-50 transition"
        >
          Edit
        </button>
      </div>

      {/* Hero Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8 shadow-sm">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="h-24 w-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-semibold text-gray-600">{initialsFromName(displayName)}</span>
            )}
          </div>

          {/* Stats */}
          <div className="flex-1">
            <div className="space-y-1 mb-4">
              <div className="text-sm text-gray-600">{stats.placesAdded} Places added</div>
              <div className="text-sm text-gray-600">{stats.reviews} Comment{stats.reviews !== 1 ? 's' : ''}</div>
              <div className="text-sm text-gray-600">{stats.favoritesCount} My favorites</div>
            </div>
            <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-1">{displayName}</h2>
            {/* Location would go here if available */}
          </div>
        </div>
      </div>

      {/* My work */}
      {myWork && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="font-semibold text-[#2d2d2d]">My work: {myWork}</span>
          </div>
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="mb-8">
          <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">{bio}</p>
        </div>
      )}

      {/* My reviews */}
      {reviewsReceived.length > 0 && (
        <div className="mb-8">
          <h3 className="text-2xl font-semibold text-[#2d2d2d] mb-4">My reviews</h3>
          <div className="space-y-6">
            {reviewsReceived.slice(0, 5).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
            {reviewsReceived.length > 5 && (
              <button className="text-sm text-gray-600 hover:text-[#2d2d2d] transition">
                Show all reviews
              </button>
            )}
          </div>
        </div>
      )}

      {/* Reviews I've written */}
      {reviewsWritten.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-2xl font-semibold text-[#2d2d2d]">Reviews I've written</h3>
          </div>
          <div className="space-y-6">
            {reviewsWritten.slice(0, 5).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
            {reviewsWritten.length > 5 && (
              <button className="text-sm text-gray-600 hover:text-[#2d2d2d] transition">
                Show all reviews
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="border-b border-gray-200 pb-6 last:border-b-0">
      <div className="flex items-start gap-4 mb-3">
        {review.reviewer_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.reviewer_avatar}
            alt={review.reviewer_name}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-gray-600">{initialsFromName(review.reviewer_name)}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#2d2d2d]">{review.reviewer_name}</div>
          {review.reviewer_location && (
            <div className="text-sm text-gray-600">{review.reviewer_location}</div>
          )}
          <div className="text-sm text-gray-500">{formatDate(new Date(review.created_at))}</div>
        </div>
      </div>
      <p className="text-gray-700 mb-2">{review.text}</p>
      {review.place_title && (
        <Link href={`/id/${review.place_id}`} className="text-sm text-gray-600 hover:text-[#2d2d2d] transition">
          {review.place_title}
          {review.place_address && ` · ${review.place_address}`}
        </Link>
      )}
    </div>
  );
}

function TripsSection({ places, loading }: { places: Place[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-16 text-gray-500">Loading…</div>;
  }

  if (places.length === 0) {
    return <div className="text-center py-16 text-gray-500">No saved places yet</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold text-[#2d2d2d] mb-8">My favorites</h1>
      <div className="grid grid-cols-3 gap-6">
        {places.map((place) => (
          <Link key={place.id} href={`/id/${place.id}`} className="group">
            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-2">
              {place.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={place.cover_url}
                  alt={place.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#2d2d2d] mb-1 line-clamp-1">{place.title}</h3>
              {place.city && <p className="text-xs text-gray-600">{place.city}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AddedPlacesSection({ places, loading }: { places: Place[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-16 text-gray-500">Loading…</div>;
  }

  if (places.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold text-[#2d2d2d] mb-8">Added places</h1>
        <div className="text-center py-16 text-gray-500">You haven't added any places yet</div>
      </div>
    );
  }

  const router = useRouter();

  return (
    <div>
      <h1 className="text-3xl font-semibold text-[#2d2d2d] mb-8">Added places</h1>
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-6">
        {places.map((place) => (
          <div key={place.id} className="group relative">
            <Link href={`/id/${place.id}`}>
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-2 relative">
                {place.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={place.cover_url}
                    alt={place.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {/* Edit button - appears on hover */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/places/${place.id}/edit`);
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg hover:bg-white z-10"
                  aria-label="Edit place"
                >
                  <svg className="w-5 h-5 text-[#2d2d2d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#2d2d2d] mb-1 line-clamp-1">{place.title}</h3>
                {place.city && <p className="text-xs text-gray-600">{place.city}</p>}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitySection({
  activity,
  loading,
  profile,
  displayName,
}: {
  activity: ActivityItem[];
  loading: boolean;
  profile: Profile | null;
  displayName: string;
}) {
  if (loading) {
    return <div className="text-center py-16 text-gray-500">Loading…</div>;
  }

  if (activity.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold text-[#2d2d2d] mb-8">Activity</h1>
        <div className="text-center py-16 text-gray-500">No activity yet</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold text-[#2d2d2d] mb-8">Activity</h1>
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
    </div>
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

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading…</div>
      </main>
    }>
      <ProfileInner />
    </Suspense>
  );
}
