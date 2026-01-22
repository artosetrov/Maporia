"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import FiltersModal, { ActiveFilters } from "../components/FiltersModal";
import { supabase } from "../lib/supabase";
import Icon from "../components/Icon";
import PlaceCard from "../components/PlaceCard";
import FavoriteIcon from "../components/FavoriteIcon";
import { useUserAccess } from "../hooks/useUserAccess";
import { isUserAdmin, isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import { DEFAULT_CITY } from "../constants";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  created_at: string;
  created_by?: string | null;
  access_level?: string | null;
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
  categories?: string[] | null;
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
  role?: string | null;
  subscription_status?: string | null;
  is_admin?: boolean | null;
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

function getUserStatus(role: string | null | undefined, subscriptionStatus: string | null | undefined, isAdmin: boolean | null | undefined): string {
  if (isAdmin || role === 'admin') {
    return 'Admin';
  }
  if (role === 'premium' || subscriptionStatus === 'active') {
    return 'Premium Member';
  }
  if (role === 'standard') {
    return 'Standard User';
  }
  return 'Member';
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function ProfileInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [section, setSection] = useState<"about" | "trips" | "added" | "activity" | "users">("about");
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState<boolean>(false);

  const [added, setAdded] = useState<Place[]>([]);
  const [saved, setSaved] = useState<Place[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [reviewsReceived, setReviewsReceived] = useState<Review[]>([]);
  const [reviewsWritten, setReviewsWritten] = useState<Review[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Search and filter state
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // Calculate active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (activeFilters.categories.length > 0) count += activeFilters.categories.length;
    if (activeFilters.sort) count += 1;
    return count;
  }, [activeFilters]);

  // Filter places based on search and filters
  const filteredAdded = useMemo(() => {
    let filtered = [...added];

    // Filter by search
    if (searchValue.trim()) {
      const search = searchValue.trim().toLowerCase();
      filtered = filtered.filter((place) => {
        const titleMatch = place.title?.toLowerCase().includes(search);
        const addressMatch = place.address?.toLowerCase().includes(search);
        const cityMatch = place.city?.toLowerCase().includes(search);
        return titleMatch || addressMatch || cityMatch;
      });
    }

    // Filter by city
    if (selectedCity && selectedCity !== DEFAULT_CITY) {
      filtered = filtered.filter((place) => place.city === selectedCity);
    }

    // Filter by categories
    if (activeFilters.categories.length > 0) {
      filtered = filtered.filter((place) => {
        if (!place.categories || place.categories.length === 0) return false;
        return activeFilters.categories.some((cat) => place.categories?.includes(cat));
      });
    }

    // Sort
    if (activeFilters.sort) {
      if (activeFilters.sort === "newest") {
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (activeFilters.sort === "oldest") {
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      } else if (activeFilters.sort === "title") {
        filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      }
    }

    return filtered;
  }, [added, searchValue, selectedCity, activeFilters]);

  const filteredSaved = useMemo(() => {
    let filtered = [...saved];

    // Filter by search
    if (searchValue.trim()) {
      const search = searchValue.trim().toLowerCase();
      filtered = filtered.filter((place) => {
        const titleMatch = place.title?.toLowerCase().includes(search);
        const addressMatch = place.address?.toLowerCase().includes(search);
        const cityMatch = place.city?.toLowerCase().includes(search);
        return titleMatch || addressMatch || cityMatch;
      });
    }

    // Filter by city
    if (selectedCity && selectedCity !== DEFAULT_CITY) {
      filtered = filtered.filter((place) => place.city === selectedCity);
    }

    // Filter by categories
    if (activeFilters.categories.length > 0) {
      filtered = filtered.filter((place) => {
        if (!place.categories || place.categories.length === 0) return false;
        return activeFilters.categories.some((cat) => place.categories?.includes(cat));
      });
    }

    // Sort
    if (activeFilters.sort) {
      if (activeFilters.sort === "newest") {
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (activeFilters.sort === "oldest") {
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      } else if (activeFilters.sort === "title") {
        filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      }
    }

    return filtered;
  }, [saved, searchValue, selectedCity, activeFilters]);

  // Handle search change - filter locally on profile page
  function handleSearchChange(value: string) {
    setSearchValue(value);
    // Filter is applied via useMemo filteredAdded/filteredSaved
  }

  // Handle city change - filter locally on profile page
  function handleCityChange(city: string | null) {
    setSelectedCity(city);
    // Filter is applied via useMemo filteredAdded/filteredSaved
  }

  // Handle filters apply - filter locally on profile page
  function handleFiltersApply(filters: ActiveFilters) {
    setActiveFilters(filters);
    setFilterOpen(false);
    // Filter is applied via useMemo filteredAdded/filteredSaved
  }
  
  // Admin access check - use profile data from useEffect
  const isAdmin = userIsAdmin || userRole === 'admin';

  const stats = useMemo(() => {
    return {
      placesAdded: added.length,
      reviews: commentsCount,
      favoritesCount: saved.length,
    };
  }, [added, commentsCount, saved]);

  const editProcessedRef = useRef(false);

  useEffect(() => {
    const editParam = searchParams?.get("edit");
    if (editParam === "true" && !editProcessedRef.current) {
      editProcessedRef.current = true;
      router.push("/profile/edit");
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

      // profile (include role and is_admin for admin check)
      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, role, is_admin, subscription_status")
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
        
        // Set admin status from profile
        const profileRole = (prof as any)?.role;
        const profileIsAdmin = (prof as any)?.is_admin === true;
        setUserRole(profileRole || null);
        setUserIsAdmin(profileIsAdmin);
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
        showSearchBar={section === "trips" || section === "added"}
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        selectedCity={selectedCity}
        onCityChange={handleCityChange}
        onFiltersClick={() => {
          if (section === "trips" || section === "added") {
            setFilterOpen(true);
          }
        }}
        activeFiltersCount={activeFiltersCount}
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

      {/* Filters Modal */}
      {(section === "trips" || section === "added") && (
        <FiltersModal
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          onApply={handleFiltersApply}
          appliedFilters={activeFilters}
          getFilteredCount={async (draftFilters: ActiveFilters) => {
            try {
              const placesToFilter = section === "trips" ? saved : added;
              let filtered = [...placesToFilter];

              // Filter by search
              if (searchValue.trim()) {
                const search = searchValue.trim().toLowerCase();
                filtered = filtered.filter((place) => {
                  const titleMatch = place.title?.toLowerCase().includes(search);
                  const addressMatch = place.address?.toLowerCase().includes(search);
                  const cityMatch = place.city?.toLowerCase().includes(search);
                  return titleMatch || addressMatch || cityMatch;
                });
              }

              // Filter by city
              if (selectedCity && selectedCity !== DEFAULT_CITY) {
                filtered = filtered.filter((place) => place.city === selectedCity);
              }

              // Filter by categories
              if (draftFilters.categories.length > 0) {
                filtered = filtered.filter((place) => {
                  if (!place.categories || place.categories.length === 0) return false;
                  return draftFilters.categories.some((cat) => place.categories?.includes(cat));
                });
              }

              return filtered.length;
            } catch (error) {
              console.error("Error in getFilteredCount:", error);
              return 0;
            }
          }}
        />
      )}

      <div className="pt-[64px] min-[900px]:pt-[80px]">
        {/* Desktop Layout */}
        <div className="hidden min-[900px]:flex min-h-[calc(100vh-80px)]">
          {/* Left Sidebar */}
          <aside className="w-64 border-r border-[#ECEEE4] bg-white flex-shrink-0">
            <div className="sticky top-[80px] p-6">
              <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Profile</h2>
              <nav className="space-y-1">
                <button
                  onClick={() => setSection("about")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "about"
                      ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                      : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                  )}
                >
                  <div className="w-6 h-6 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-xs font-semibold text-[#8F9E4F]">{initialsFromName(displayName)}</span>
                    )}
                  </div>
                  <span>About me</span>
                </button>
                <button
                  onClick={() => setSection("trips")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "trips"
                      ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                      : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                  )}
                >
                  <Icon name="bookmark" size={24} className="flex-shrink-0" />
                  <span>My favorites</span>
                </button>
                <button
                  onClick={() => setSection("added")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "added"
                      ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                      : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                  )}
                >
                  <Icon name="add" size={24} className="flex-shrink-0" />
                  <span>Added places</span>
                </button>
                <button
                  onClick={() => setSection("activity")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "activity"
                      ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                      : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                  )}
                >
                  <Icon name="clock" size={24} className="flex-shrink-0" />
                  <span>Activity</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setSection("users")}
                    className={cx(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                      section === "users"
                        ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                        : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                    )}
                  >
                    <Icon name="users" size={24} className="flex-shrink-0" />
                    <span>Users</span>
                  </button>
                )}
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
                  onEditClick={() => router.push("/profile/edit")}
                  loading={loading}
                  userRole={userRole}
                  subscriptionStatus={profile?.subscription_status}
                  isAdmin={userIsAdmin}
                />
              )}
              {section === "trips" && (
                <TripsSection places={saved} loading={loading} userId={userId} onRemoveFavorite={(placeId) => {
                  setSaved((prev) => prev.filter((p) => p.id !== placeId));
                }} />
              )}
              {section === "added" && (
                <AddedPlacesSection places={added} loading={loading} />
              )}
              {section === "activity" && (
                <ActivitySection activity={activity} loading={loading} profile={profile} displayName={displayName} />
              )}
              {section === "users" && isAdmin && (
                <UsersSection loading={loading} currentUserId={userId} />
              )}
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="min-[900px]:hidden">
          {section === "trips" || section === "added" || section === "activity" || (section === "users" && isAdmin) ? (
            // Show section content on mobile
            <div className="px-6 py-6">
              {section === "trips" && (
                <TripsSection places={saved} loading={loading} userId={userId} onRemoveFavorite={(placeId) => {
                  setSaved((prev) => prev.filter((p) => p.id !== placeId));
                }} />
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
                    className="mb-4 flex items-center gap-2 text-[#6F7A5A] hover:text-[#1F2A1F] transition"
                  >
                    <Icon name="back" size={20} />
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <ActivitySection activity={activity} loading={loading} profile={profile} displayName={displayName} />
                </div>
              )}
              {section === "users" && isAdmin && (
                <div>
                  <button
                    onClick={() => {
                      setSection("about");
                      router.replace("/profile", { scroll: false });
                    }}
                    className="mb-4 flex items-center gap-2 text-[#6F7A5A] hover:text-[#1F2A1F] transition"
                  >
                    <Icon name="back" size={20} />
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <UsersSection loading={loading} currentUserId={userId} />
                </div>
              )}
            </div>
          ) : (
            // Show main mobile dashboard
            <div className="px-6 py-6 space-y-4">
              {loading ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm">
                    <div className="flex items-center gap-6">
                      <div className="h-16 w-16 rounded-full bg-[#ECEEE4] animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
                        <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-[#ECEEE4] p-4">
                        <div className="aspect-[4/3] rounded-xl bg-[#ECEEE4] mb-3 animate-pulse" />
                        <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Profile Hero Card */}
                  <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm" style={{ minHeight: '140px' }}>
                    <div className="flex items-center gap-6 h-full">
                      {/* Left: Avatar, Name, Location (≈ 60%) */}
                      <div className="flex-shrink-0" style={{ width: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        {/* Avatar */}
                        <div className="h-16 w-16 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center overflow-hidden" style={{ marginBottom: '10px' }}>
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-2xl font-semibold text-[#8F9E4F]">{initialsFromName(displayName)}</span>
                          )}
                        </div>
                        {/* Name */}
                        <h1 className="font-fraunces text-[#1F2A1F] leading-tight m-0 text-center" style={{ fontWeight: 600, fontSize: '22px' }}>{displayName}</h1>
                        {/* User Status */}
                        <div className="text-[#6F7A5A] leading-tight m-0 text-center" style={{ fontSize: '14px', marginTop: '4px' }}>
                          {getUserStatus(userRole, profile?.subscription_status, userIsAdmin)}
                        </div>
                      </div>

                      {/* Right: Stats (≈ 40%) */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ width: '40%' }}>
                        <div className="space-y-0">
                          <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                            <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.placesAdded}</div>
                            <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '1px', lineHeight: '1.1' }}>Places added</div>
                          </div>
                          <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                            <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.reviews}</div>
                            <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '1px', lineHeight: '1.1' }}>Comments</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                            <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.favoritesCount}</div>
                            <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '1px', lineHeight: '1.1' }}>My favorites</div>
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
                      className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
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
                                className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-[#1F2A1F] badge-shadow z-10"
                                style={{ zIndex: 10 }}
                              >
                                +{saved.length - 2}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="photo" size={24} className="text-[#A8B096]" />
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#1F2A1F] text-center">My favorites</div>
                    </button>

                    {/* Added places */}
                    <button
                      onClick={() => setSection("added")}
                      className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
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
                                className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-[#1F2A1F] badge-shadow z-10"
                                style={{ zIndex: 10 }}
                              >
                                +{added.length - 2}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="add" size={24} className="text-[#A8B096]" />
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#1F2A1F] text-center">Added places</div>
                    </button>
                  </div>

                  {/* Activity Card */}
                  <button
                    onClick={() => setSection("activity")}
                    className="w-full py-4 transition text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon name="clock" size={24} className="text-[#1F2A1F] flex-shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-[#1F2A1F]">Activity</div>
                          <div className="text-xs text-[#6F7A5A]">View your recent activity</div>
                        </div>
                      </div>
                      <Icon name="forward" size={20} className="text-[#A8B096]" />
                    </div>
                  </button>

                  {/* Edit profile button */}
                  <Link
                    href="/profile/edit"
                    className="w-full py-4 transition text-left block"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-[#1F2A1F] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-[#1F2A1F]">Edit profile</div>
                          <div className="text-xs text-[#6F7A5A]">Update your information</div>
                        </div>
                      </div>
                      <Icon name="forward" size={20} className="text-[#A8B096]" />
                    </div>
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>


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
  userRole,
  subscriptionStatus,
  isAdmin,
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
  userRole?: string | null;
  subscriptionStatus?: string | null;
  isAdmin?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
          <div className="flex items-start gap-6">
            <div className="h-24 w-24 rounded-full bg-[#ECEEE4] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-4 w-32 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-6 w-40 bg-[#ECEEE4] rounded mt-4 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F]">About me</h1>
        <button
          onClick={onEditClick}
          className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
        >
          Edit
        </button>
      </div>

      {/* Hero Card - Same as mobile */}
      <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm mb-8" style={{ minHeight: '140px' }}>
        <div className="flex items-center gap-6 h-full">
          {/* Left: Avatar, Name, Location (≈ 60%) */}
          <div className="flex-shrink-0" style={{ width: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Avatar */}
            <div className="h-16 w-16 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center overflow-hidden" style={{ marginBottom: '10px' }}>
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-[#8F9E4F]">{initialsFromName(displayName)}</span>
              )}
            </div>
            {/* Name */}
            <h1 className="font-fraunces text-[#1F2A1F] leading-tight m-0 text-center" style={{ fontWeight: 600, fontSize: '22px' }}>{displayName}</h1>
            {/* User Status */}
            <div className="text-[#6F7A5A] leading-tight m-0 text-center" style={{ fontSize: '14px', marginTop: '4px' }}>
              {getUserStatus(userRole, subscriptionStatus, isAdmin)}
            </div>
          </div>

          {/* Right: Stats (≈ 40%) */}
          <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ width: '40%' }}>
            <div className="space-y-0">
              <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.placesAdded}</div>
                <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '1px', lineHeight: '1.1' }}>Places added</div>
              </div>
              <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.reviews}</div>
                <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '1px', lineHeight: '1.1' }}>Comments</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '6px', paddingBottom: '6px' }}>
                <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.favoritesCount}</div>
                <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '1px', lineHeight: '1.1' }}>My favorites</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* My work */}
      {myWork && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="briefcase" size={20} className="text-[#6F7A5A]" />
            <span className="font-semibold text-[#1F2A1F]">My work: {myWork}</span>
          </div>
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="mb-8">
          <p className="text-base text-[#1F2A1F] leading-relaxed whitespace-pre-line">{bio}</p>
        </div>
      )}

      {/* My reviews */}
      {reviewsReceived.length > 0 && (
        <div className="mb-8">
          <h3 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-4">My reviews</h3>
          <div className="space-y-6">
            {reviewsReceived.slice(0, 5).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
            {reviewsReceived.length > 5 && (
              <button className="text-sm text-[#6F7A5A] hover:text-[#1F2A1F] transition">
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
            <svg className="w-5 h-5 text-[#6F7A5A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-2xl font-semibold font-fraunces text-[#1F2A1F]">Reviews I've written</h3>
          </div>
          <div className="space-y-6">
            {reviewsWritten.slice(0, 5).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
            {reviewsWritten.length > 5 && (
              <button className="text-sm text-[#6F7A5A] hover:text-[#1F2A1F] transition">
                Show all reviews
              </button>
            )}
          </div>
        </div>
      )}

      {/* Admin Section */}
      {isAdmin && (
        <div className="mt-8 pt-8 border-t border-[#ECEEE4]">
          <h3 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-4">Admin Tools</h3>
          <Link
            href="/brand-guide"
            className="block rounded-xl border border-[#ECEEE4] bg-white p-5 hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                  <Icon name="package" size={20} className="text-[#8F9E4F]" />
                </div>
                <div>
                  <div className="font-semibold text-[#1F2A1F]">Brand Guide</div>
                  <div className="text-sm text-[#6F7A5A]">Complete design system and brand guidelines</div>
                </div>
              </div>
              <Icon name="forward" size={20} className="text-[#A8B096] group-hover:text-[#6F7A5A] transition" />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="border-b border-[#ECEEE4] pb-6 last:border-b-0">
      <div className="flex items-start gap-4 mb-3">
        {review.reviewer_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.reviewer_avatar}
            alt={review.reviewer_name}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-[#8F9E4F]">{initialsFromName(review.reviewer_name)}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#1F2A1F]">{review.reviewer_name}</div>
          {review.reviewer_location && (
            <div className="text-sm text-[#6F7A5A]">{review.reviewer_location}</div>
          )}
          <div className="text-sm text-[#A8B096]">{formatDate(new Date(review.created_at))}</div>
        </div>
      </div>
      <p className="text-[#1F2A1F] mb-2">{review.text}</p>
      {review.place_title && (
        <Link href={`/id/${review.place_id}`} className="text-sm text-[#6F7A5A] hover:text-[#1F2A1F] transition">
          {review.place_title}
          {review.place_address && ` · ${review.place_address}`}
        </Link>
      )}
    </div>
  );
}

function TripsSection({ 
  places, 
  loading, 
  userId,
  onRemoveFavorite,
  searchValue,
  selectedCity,
  activeFilters
}: { 
  places: Place[]; 
  loading: boolean;
  userId: string | null;
  onRemoveFavorite: (placeId: string) => void;
  searchValue?: string;
  selectedCity?: string | null;
  activeFilters?: ActiveFilters;
}) {
  const { access } = useUserAccess();

  async function handleRemoveFavorite(placeId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

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
      } else {
        // Remove from local state
        onRemoveFavorite(placeId);
      }
    } catch (err) {
      console.error("Remove favorite error:", err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
          <div className="flex items-start gap-6">
            <div className="h-24 w-24 rounded-full bg-[#ECEEE4] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-4 w-32 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-6 w-40 bg-[#ECEEE4] rounded mt-4 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    const hasFilters = searchValue || (selectedCity && selectedCity !== DEFAULT_CITY) || (activeFilters?.categories && activeFilters.categories.length > 0);
    return (
      <div className="text-center py-16 text-[#6F7A5A]">
        {hasFilters ? "No places match your filters" : "No saved places yet"}
      </div>
    );
  }

  // Calculate locked premium places for Haunted Gem indexing
  const defaultUserAccess: UserAccess = access ?? { 
    role: "guest", 
    hasPremium: false, 
    isAdmin: false 
  };
  
  const lockedPlacesMap = useMemo(() => {
    const lockedPlaces = places
      .filter(p => {
        const pIsPremium = isPlacePremium(p);
        const pCanView = canUserViewPlace(defaultUserAccess, p);
        const pIsOwner = userId && p.created_by === userId;
        return pIsPremium && !pCanView && !pIsOwner;
      })
      .sort((a, b) => {
        // Sort by created_at for consistent ordering
        if (a.created_at && b.created_at) {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        // Fallback to id for consistent ordering
        return a.id.localeCompare(b.id);
      });
    
    // Create a map of place id -> index (1-based)
    const map = new Map<string, number>();
    lockedPlaces.forEach((p, idx) => {
      map.set(p.id, idx + 1);
    });
    return map;
  }, [places, defaultUserAccess, userId]);

  return (
    <div>
      <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">My favorites</h1>
      <div className="grid grid-cols-1 min-[900px]:grid-cols-4 gap-6">
        {places.map((place) => {
          const hauntedGemIndex = lockedPlacesMap.get(place.id);
          return (
            <PlaceCard
              key={place.id}
              place={place}
              userAccess={access}
              userId={userId}
              isFavorite={true}
              hauntedGemIndex={hauntedGemIndex}
              favoriteButton={
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemoveFavorite(place.id, e);
                  }}
                  className="bg-white/90 backdrop-blur-sm rounded-lg p-2 badge-shadow hover:bg-white transition-colors"
                  aria-label="Remove from favorites"
                >
                  <FavoriteIcon isActive={true} size={20} />
                </button>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function AddedPlacesSection({ 
  places, 
  loading,
  searchValue,
  selectedCity,
  activeFilters
}: { 
  places: Place[]; 
  loading: boolean;
  searchValue?: string;
  selectedCity?: string | null;
  activeFilters?: ActiveFilters;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
          <div className="flex items-start gap-6">
            <div className="h-24 w-24 rounded-full bg-[#ECEEE4] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-4 w-32 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-6 w-40 bg-[#ECEEE4] rounded mt-4 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    const hasFilters = searchValue || (selectedCity && selectedCity !== DEFAULT_CITY) || (activeFilters?.categories && activeFilters.categories.length > 0);
    return (
      <div>
        <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Added places</h1>
        <div className="text-center py-16 text-[#6F7A5A]">
          {hasFilters ? "No places match your filters" : "You haven't added any places yet"}
        </div>
      </div>
    );
  }

  const router = useRouter();

  return (
    <div>
      <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Added places</h1>
      <div className="grid grid-cols-1 min-[900px]:grid-cols-4 gap-6">
        {places.map((place) => (
          <div key={place.id} className="group relative">
            <Link href={`/id/${place.id}`}>
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[#FAFAF7] mb-2 relative">
                {place.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={place.cover_url}
                    alt={place.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-[#A8B096]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm rounded-lg p-2 badge-shadow hover:bg-white z-10"
                  aria-label="Edit place"
                >
                  <svg className="w-5 h-5 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div>
                <h3 className="text-sm font-medium font-fraunces text-[#1F2A1F] mb-1 line-clamp-1">{place.title}</h3>
                {place.city && <p className="text-xs text-[#6F7A5A]">{place.city}</p>}
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
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
          <div className="flex items-start gap-6">
            <div className="h-24 w-24 rounded-full bg-[#ECEEE4] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-4 w-32 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-6 w-40 bg-[#ECEEE4] rounded mt-4 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Activity</h1>
        <div className="text-center py-16 text-[#6F7A5A]">No activity yet</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Activity</h1>
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

type User = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  is_admin: boolean | null;
  subscription_status: string | null;
  created_at: string;
};

function UsersSection({ loading, currentUserId }: { loading: boolean; currentUserId: string | null }) {
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track pending role changes before saving
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Map<string, 'standard' | 'premium' | 'admin'>>(new Map());

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setUsersLoading(true);
    setError(null);
    
    try {
      // Load all profiles (admin can see all users)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, role, is_admin, subscription_status, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) {
        console.error("Error loading users:", profilesError);
        setError("Failed to load users");
        return;
      }

      // Try to get emails from auth.users via RPC or use profiles data
      // Note: Email might not be available on client-side without admin API
      const usersWithData: User[] = (profiles || []).map(profile => ({
        id: profile.id,
        email: null, // Email requires server-side admin API access
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        role: profile.role || 'standard',
        is_admin: profile.is_admin || false,
        subscription_status: profile.subscription_status || 'inactive',
        created_at: profile.created_at,
      }));

      setUsers(usersWithData);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  function handleRoleChange(userId: string, newRole: 'standard' | 'premium' | 'admin') {
    // Store pending change instead of saving immediately
    setPendingRoleChanges(prev => {
      const next = new Map(prev);
      next.set(userId, newRole);
      return next;
    });
    setError(null);
  }

  async function saveUserRole(userId: string) {
    const newRole = pendingRoleChanges.get(userId);
    if (!newRole) return;

    setUpdatingUserId(userId);
    setError(null);

    try {
      const updates: any = {
        role: newRole,
      };

      // Update is_admin based on role
      if (newRole === 'admin') {
        updates.is_admin = true;
      } else {
        updates.is_admin = false;
      }

      // Update subscription_status based on role
      if (newRole === 'premium') {
        updates.subscription_status = 'active';
      } else if (newRole === 'standard') {
        updates.subscription_status = 'inactive';
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select();

      if (error) {
        console.error("Error updating user role:", error);
        setError(`Failed to update user role: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        console.error("No data returned from update");
        setError("Failed to update user role: No data returned. Check RLS policies.");
        return;
      }

      // Remove from pending changes
      setPendingRoleChanges(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });

      // Reload users
      await loadUsers();
    } catch (err) {
      console.error("Error updating user role:", err);
      setError("Failed to update user role");
    } finally {
      setUpdatingUserId(null);
    }
  }

  function cancelRoleChange(userId: string) {
    setPendingRoleChanges(prev => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }

  async function deleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }

    if (userId === currentUserId) {
      setError("You cannot delete your own account");
      return;
    }

    setDeletingUserId(userId);
    setError(null);

    try {
      // Delete from profiles (auth deletion requires server-side admin API)
      // Note: This will delete the profile but not the auth user
      // For full deletion, you need a server-side API endpoint
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) {
        console.error("Error deleting user profile:", profileError);
        setError("Failed to delete user. Note: Full user deletion requires server-side API.");
        return;
      }

      // Reload users
      await loadUsers();
    } catch (err) {
      console.error("Error deleting user:", err);
      setError("Failed to delete user");
    } finally {
      setDeletingUserId(null);
    }
  }

  if (loading || usersLoading) {
    return (
      <div>
        <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Users</h1>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-[#ECEEE4] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-[#ECEEE4] rounded animate-pulse" />
                  <div className="h-3 w-24 bg-[#ECEEE4] rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Users</h1>
      
      {error && (
        <div className="mb-4 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {users.length === 0 ? (
          <div className="text-center py-16 text-[#6F7A5A]">No users found</div>
        ) : (
          users.map((user) => (
            <div key={user.id} className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="h-12 w-12 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={user.display_name || user.email || "User"} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-[#8F9E4F]">
                      {initialsFromName(user.display_name || user.email)}
                    </span>
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[#1F2A1F] truncate">
                      {user.display_name || user.username || user.email || "User"}
                    </h3>
                    {user.is_admin && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#8F9E4F] text-white">
                        Admin
                      </span>
                    )}
                    {user.role === 'premium' && !user.is_admin && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#D6B25E] text-white">
                        Premium
                      </span>
                    )}
                  </div>
                  {user.email && (
                    <p className="text-sm text-[#6F7A5A] truncate">{user.email}</p>
                  )}
                  <p className="text-xs text-[#A8B096] mt-1">
                    Joined {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Role Selector */}
                  <select
                    value={pendingRoleChanges.get(user.id) || user.role || 'standard'}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as 'standard' | 'premium' | 'admin')}
                    disabled={updatingUserId === user.id || user.id === currentUserId}
                    className="px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                    <option value="admin">Admin</option>
                  </select>

                  {/* Save/Cancel buttons if role changed */}
                  {pendingRoleChanges.has(user.id) && (
                    <>
                      <button
                        onClick={() => saveUserRole(user.id)}
                        disabled={updatingUserId === user.id}
                        className="px-3 py-2 rounded-lg bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        title="Save changes"
                      >
                        {updatingUserId === user.id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Icon name="check" size={16} />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => cancelRoleChange(user.id)}
                        disabled={updatingUserId === user.id}
                        className="px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-[#6F7A5A] text-sm font-medium hover:bg-[#FAFAF7] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Cancel changes"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </>
                  )}

                  {/* Delete Button */}
                  {user.id !== currentUserId && !pendingRoleChanges.has(user.id) && (
                    <button
                      onClick={() => deleteUser(user.id)}
                      disabled={deletingUserId === user.id}
                      className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete user"
                    >
                      {deletingUserId === user.id ? (
                        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="delete" size={16} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityCard({ item, userAvatar, userName }: { item: ActivityItem; userAvatar: string | null; userName: string }) {
  const getIcon = () => {
    const iconClass = "w-5 h-5";
    if (item.type === "liked") {
      return (
        <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
          <Icon name="favorite" size={20} className="text-[#8F9E4F]" filled active />
        </div>
      );
    }
    if (item.type === "commented") {
      return (
        <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
          <Icon name="comment" size={20} className="text-[#A8B096]" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
        <Icon name="add" size={20} className="text-[#8F9E4F]" />
      </div>
    );
  };

  const getActionText = () => {
    if (item.type === "liked") return "Added to favorites";
    if (item.type === "commented") return "Commented on a place";
    return "Added a place";
  };

  return (
    <Link
      href={`/id/${item.placeId}`}
      className="block w-full py-4 min-[900px]:py-5 px-6 hover:bg-[#FAFAF7] transition-colors border-b border-[#ECEEE4] last:border-b-0"
    >
      <div className="flex items-start gap-6">
        {/* Action Icon слева */}
        <div className="flex-shrink-0">{getIcon()}</div>

        {/* Content в центре */}
        <div className="flex-1 min-w-0">
          {/* Action text */}
          <div className="mb-2">
            <span className="text-sm font-medium text-[#1F2A1F]">{getActionText()}</span>
          </div>

          {/* Comment text (if commented) */}
          {item.type === "commented" && item.commentText && (
            <p className="text-sm text-[#6F7A5A] mb-3 line-clamp-2">{item.commentText}</p>
          )}

          {/* Place preview */}
          <div className="flex items-center gap-3">
            {item.coverUrl ? (
              <div className="w-16 h-16 min-[900px]:w-20 min-[900px]:h-20 rounded-lg bg-[#FAFAF7] overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverUrl}
                  alt={item.placeTitle ?? "Place"}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 min-[900px]:w-20 min-[900px]:h-20 rounded-lg bg-[#FAFAF7] flex items-center justify-center flex-shrink-0">
                <Icon name="photo" size={24} className="text-[#A8B096]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium font-fraunces text-[#1F2A1F] mb-1 line-clamp-1">
                {item.placeTitle ?? "Place"}
              </h3>
              {item.address && (
                <p className="text-xs text-[#6F7A5A] line-clamp-1">{item.address}</p>
              )}
            </div>
          </div>
        </div>

        {/* Timestamp справа */}
        <div className="flex-shrink-0 text-xs text-[#A8B096]">{timeAgo(item.created_at)}</div>
      </div>
    </Link>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="pt-[64px] px-6 py-6">
          <div className="space-y-4">
            <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4]">
              <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-full bg-[#ECEEE4] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
                  <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    }>
      <ProfileInner />
    </Suspense>
  );
}
