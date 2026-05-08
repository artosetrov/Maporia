"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import TopBar from "../../components/TopBar";
import { type ActiveFilters } from "../../components/FiltersModal";
// Heavy modals — only loaded when user opens them.
import nextDynamic from "next/dynamic";
const FiltersModal = nextDynamic(() => import("../../components/FiltersModal"), { ssr: false });
const SearchModal = nextDynamic(() => import("../../components/SearchModal"), { ssr: false });
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/supabase";
import Icon from "../../components/Icon";

type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username" | "display_name" | "avatar_url" | "role" | "is_admin" | "subscription_status" | "created_at">;
type PlacePhotoUrlRow = Pick<Database["public"]["Tables"]["place_photos"]["Row"], "url">;
import PlaceCard from "../../components/PlaceCard";
import FavoriteIcon from "../../components/FavoriteIcon";
import { useUserAccessContext } from "../../contexts/UserAccessContext";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import { getAuthUrl } from "../../lib/authRedirect";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { isUserAdmin, isPlacePremium, canUserViewPlace, canUserAddPlace, type UserAccess } from "../../lib/access";
import { PLAN_CONFIG, PLAN_ORDER, EXTRA_LISTING, formatPrice } from "../../lib/plans";
import { DEFAULT_CITY, getTagEmoji, stripTagEmoji } from "../../constants";
import PremiumBadge from "../../components/PremiumBadge";
import { getRecentlyViewedPlaceIds } from "../../utils";
import { ProfileSkeleton, PlaceCardGridSkeleton, SkeletonBase } from "../../components/Skeleton";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import ImpersonationDisclaimer from "../../components/ImpersonationDisclaimer";
import { useImpersonationStatus } from "../../hooks/useImpersonationStatus";
import { usePremiumModalContext } from "../../contexts/PremiumModalContext";

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
  favorite_categories?: string[] | null;
  favorite_tags?: string[] | null;
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
  const pathname = usePathname();
  const { redirectToAuth, replaceToAuth } = useAuthRedirect();

  const [section, setSection] = useState<"about" | "trips" | "added" | "activity" | "users" | "elements" | "history" | "premium">("about");
  const [profileLoading, setProfileLoading] = useState(true);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const loading = profileLoading || extrasLoading;

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState<boolean>(false);

  const [added, setAdded] = useState<Place[]>([]);
  const [saved, setSaved] = useState<Place[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Place[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [reviewsReceived, setReviewsReceived] = useState<Review[]>([]);
  const [reviewsWritten, setReviewsWritten] = useState<Review[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Search and filter state
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

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

  // Handle search change - redirect to /map like on home page
  function handleSearchChange(value: string) {
    setSearchValue(value);
    const params = new URLSearchParams();
    if (selectedCity) params.set("city", selectedCity);
    if (value.trim()) params.set("q", value);
    if (activeFilters.categories.length > 0) {
      params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    router.push(`/map?${params.toString()}`);
  }

  // Handle city change - redirect to /map like on home page
  function handleCityChange(city: string | null) {
    setSelectedCity(city);
    const params = new URLSearchParams();
    if (city && city.trim()) {
      params.set("city", encodeURIComponent(city.trim()));
    }
    if (searchValue && searchValue.trim()) {
      params.set("q", encodeURIComponent(searchValue.trim()));
    }
    if (activeFilters.categories.length > 0) {
      params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    const url = `/map?${params.toString()}`;
    router.push(url);
  }

  // Handle filters apply - redirect to /map like on home page
  const [pendingFilters, setPendingFilters] = useState<ActiveFilters | null>(null);
  
  function handleFiltersApply(filters: ActiveFilters) {
    setActiveFilters(filters);
    setPendingFilters(filters);
    setFilterOpen(false);
  }
  
  // Redirect to /map when filters are applied and city is updated
  useEffect(() => {
    if (pendingFilters) {
      const params = new URLSearchParams();
      if (selectedCity) params.set("city", selectedCity);
      if (searchValue) params.set("q", searchValue);
      if (pendingFilters.categories.length > 0) {
        params.set("categories", pendingFilters.categories.map(c => encodeURIComponent(c)).join(','));
      }
      if (pendingFilters.sort) {
        params.set("sort", pendingFilters.sort);
      }
      router.push(`/map?${params.toString()}`);
      setPendingFilters(null);
    }
  }, [pendingFilters, selectedCity, searchValue, router]);
  
  // Get user access for permission checks (and effect deps: run when session is ready)
  const { access, loading: accessLoading, user } = useUserAccessContext();
  
  // Admin access check - use profile data from useEffect
  const isAdmin = userIsAdmin || userRole === 'admin';
  
  // Check if user can add places
  const canAddPlace = canUserAddPlace(access);

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

  // Handle section parameter from URL
  useEffect(() => {
    const sectionParam = searchParams?.get("section");
    if (sectionParam && ["about", "trips", "added", "activity", "users", "elements", "history", "premium"].includes(sectionParam)) {
      setSection(sectionParam as typeof section);
    }
  }, [searchParams]);

  // Payment success/cancelled banner state
  const [paymentBanner, setPaymentBanner] = useState<"success" | "cancelled" | null>(null);

  useEffect(() => {
    const paymentParam = searchParams?.get("payment");
    if (paymentParam === "success" || paymentParam === "cancelled") {
      setPaymentBanner(paymentParam);
      // Clean up URL query param without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());

      // If payment=success, verify and activate premium via server
      if (paymentParam === "success") {
        (async () => {
          try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess.session?.access_token;
            if (!token) return;

            const res = await fetch("/api/stripe/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ access_token: token }),
            });
            const json = await res.json();

            if (json.activated) {
              // Reload page to reflect new premium status
              window.location.replace("/profile");
              return;
            }
          } catch (err) {
            console.error("[profile] Payment verification failed:", err);
          }
        })();
      }

      // Auto-dismiss after 8 seconds
      const timer = setTimeout(() => setPaymentBanner(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load profile and extras when user/session is ready from UserAccessContext (no pathname re-fetch)
  useEffect(() => {
    if (accessLoading) return;
    if (!user) {
      replaceToAuth();
      return;
    }

    let mounted = true;
    setProfileLoading(true);
    setExtrasLoading(true);
    setUserId(user.id);
    setUserEmail(user.email ?? null);
    setUserCreatedAt((user as { created_at?: string }).created_at ?? null);

    (async () => {
      try {
        // Critical: profile only — unblocks initial render (avatar, name, bio)
        const { data: prof, error: profError } = await supabase
          .from("profiles")
          .select("id, username, display_name, bio, avatar_url, role, is_admin, subscription_status, favorite_categories, favorite_tags")
          .eq("id", user.id)
          .maybeSingle();

        if (profError) {
          const msg = profError.message ?? "";
          const code = profError.code ?? "";
          if (msg || code) {
            console.error("Error loading profile:", { message: msg, code });
          }
        }

        if (mounted) {
          setProfile((prof as unknown as Profile | null) ?? null);
          setDisplayNameDraft((prof as any)?.display_name ?? (user.email ?? ""));
          setBioDraft((prof as any)?.bio ?? "");
          setAvatarDraft((prof as any)?.avatar_url ?? null);
          const profileRole = (prof as any)?.role;
          const profileIsAdmin = (prof as any)?.is_admin === true;
          setUserRole(profileRole ?? null);
          setUserIsAdmin(profileIsAdmin);
          setProfileLoading(false);
        }

        // Non-critical: load extras in background (do not block UI)
        (async () => {
          try {
            const recentlyViewedIds = getRecentlyViewedPlaceIds();

        const [
          addedPlacesResult,
          reactionsResult,
          commentsCountResult,
          commentsWrittenResult,
          commentsForActivityResult,
          recentlyViewedResult,
        ] = await Promise.all([
          supabase
            .from("places")
            .select("id,title,city,country,address,cover_url,created_at")
            .eq("created_by", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("reactions")
            .select("place_id, reaction, created_at")
            .eq("user_id", user.id)
            .eq("reaction", "like"),
          supabase
            .from("comments")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("comments")
            .select("id, text, created_at, place_id")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("comments")
            .select("place_id, created_at, text")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
          recentlyViewedIds.length > 0
            ? supabase
                .from("places")
                .select("id,title,city,country,address,cover_url,created_at,categories")
                .in("id", recentlyViewedIds)
                .limit(20)
            : Promise.resolve({ data: null }),
        ]);

        if (!mounted) return;

        const addedPlaces = (addedPlacesResult.data ?? []) as any[];
        const reactions = reactionsResult.data ?? [];
        const commentsCountData = commentsCountResult.count ?? 0;
        const commentsWritten = commentsWrittenResult.data ?? [];
        const comments = commentsForActivityResult.data ?? [];

        if (mounted) setAdded(addedPlaces as Place[]);

        let recentlyViewedPlaces: Place[] = [];
        if (recentlyViewedResult.data && recentlyViewedIds.length > 0) {
          const placesMap = new Map((recentlyViewedResult.data as Place[]).map((p) => [p.id, p]));
          recentlyViewedPlaces = recentlyViewedIds
            .map((id) => placesMap.get(id))
            .filter((p): p is Place => p !== undefined);
        }
        if (mounted) setRecentlyViewed(recentlyViewedPlaces);
        if (mounted) setCommentsCount(commentsCountData || 0);

        const placeIds = (reactions as any[]).map((r: any) => r.place_id);
        const addedPlaceIds = addedPlaces.map((p: any) => p.id);

        const [savedPlacesResult, commentsReceivedResult] = await Promise.all([
          placeIds.length > 0
            ? supabase
                .from("places")
                .select("id,title,city,country,address,cover_url,created_at,categories")
                .in("id", placeIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          addedPlaceIds.length > 0
            ? supabase
                .from("comments")
                .select("id, text, created_at, place_id, user_id")
                .in("place_id", addedPlaceIds)
                .neq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(20)
            : Promise.resolve({ data: [] }),
        ]);

        if (!mounted) return;

        const savedPlaces = (savedPlacesResult.data ?? []) as Place[];
        if (mounted) setSaved(savedPlaces);

        const commentsReceived = commentsReceivedResult.data ?? [];
        let reviewsReceivedData: Review[] = [];

        if (commentsReceived.length > 0) {
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

          reviewsReceivedData = (commentsReceived as any[]).map((c: any) => {
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
              reviewer_location: null,
            };
          });
        }

        let reviewsWrittenData: Review[] = [];
        if (commentsWritten.length > 0) {
          const placeIdsForWritten = Array.from(new Set((commentsWritten as any[]).map((c: any) => c.place_id)));
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

          reviewsWrittenData = (commentsWritten as any[]).map((c: any) => {
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

        const likesAct: ActivityItem[] = (reactions as any[]).map((r: any) => ({
          type: "liked",
          created_at: r.created_at,
          placeId: r.place_id,
        }));

        const commentsAct: ActivityItem[] = (comments as any[]).map((c: any) => ({
          type: "commented",
          created_at: c.created_at,
          placeId: c.place_id,
          commentText: c.text,
        }));

        const addedAct: ActivityItem[] = addedPlaces.map((p: any) => ({
          type: "added",
          created_at: p.created_at,
          placeId: p.id,
        }));

        const act = [...likesAct, ...commentsAct, ...addedAct].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const actPlaceIds = Array.from(new Set(act.map((a) => a.placeId)));
        const actPlacesMap = new Map<string, { title: string; cover_url: string | null; address: string | null }>();

        if (actPlaceIds.length) {
          const { data: ps } = await supabase.from("places").select("id,title,cover_url,address").in("id", actPlaceIds);
          (ps ?? []).forEach((p: any) => actPlacesMap.set(p.id, { title: p.title, cover_url: p.cover_url, address: p.address }));
        }

        const actWithTitles = act.map((a) => {
          const place = actPlacesMap.get(a.placeId);
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
          setExtrasLoading(false);
        }
          } catch (extrasErr) {
            if (mounted) setExtrasLoading(false);
            if (process.env.NODE_ENV === "development") {
              console.error("Profile extras load error:", extrasErr);
            }
          }
        })();
      } catch (err) {
        if (mounted) {
          setProfileLoading(false);
          setExtrasLoading(false);
        }
        console.error("Profile load error:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router, accessLoading, user?.id]);

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
        // @ts-expect-error Supabase generated types infer upsert payload as never
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
      // @ts-expect-error Supabase generated types infer upsert payload as never
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
      // @ts-expect-error Supabase generated types infer upsert payload as never
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

  async function handleLogout() {
    await supabase.auth.signOut();
    replaceToAuth();
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Payment result banner */}
      {paymentBanner === "success" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-4 py-3 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium text-center shadow-lg animate-slide-down">
          Premium активирован! Спасибо за покупку.
          <button
            onClick={() => setPaymentBanner(null)}
            className="ml-3 text-white/80 hover:text-white transition-colors"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      )}
      {paymentBanner === "cancelled" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-4 py-3 rounded-xl bg-[#FAFAF7] border border-[#ECEEE4] text-[#6F7A5A] text-sm font-medium text-center shadow-lg animate-slide-down">
          Оплата отменена. Вы можете попробовать снова.
          <button
            onClick={() => setPaymentBanner(null)}
            className="ml-3 text-[#6F7A5A]/80 hover:text-[#1F2A1F] transition-colors"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      )}

      {/* Desktop TopBar */}
      <div className="hidden lg:block">
        <TopBar
          showSearchBar={true}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          selectedCity={selectedCity}
          onCityChange={handleCityChange}
          onFiltersClick={() => {
            setFilterOpen(true);
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
          onSearchBarClick={() => setSearchModalOpen(true)}
        />
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={handleCityChange}
        onSearchSubmit={(city, query, tags) => {
          if (tags) {
            setSelectedTags(tags);
            setActiveFilters(prev => ({
              ...prev,
              categories: tags,
            }));
          }
          handleCityChange(city);
          handleSearchChange(query);
        }}
        selectedCity={selectedCity}
        searchQuery={searchValue}
        selectedTags={selectedTags}
      />

      {/* Mobile Custom Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white">
        <div className="px-4 pt-safe-top pt-4 pb-4 flex items-center justify-between h-[64px]">
          {section === "about" ? (
            <>
              <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: '24px' }}>Profile</h1>
              <Link
                href="/map"
                className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
                aria-label="Close and go to map"
              >
                <Icon name="close" size={20} className="text-[#1F2A1F]" />
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setSection("about");
                  router.replace("/profile", { scroll: false });
                }}
                className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
                aria-label="Back"
              >
                <Icon name="back" size={20} className="text-[#1F2A1F]" />
              </button>
              <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: '24px' }}>
                {section === "trips" ? "My favorites" :
                 section === "added" ? "Added" :
                 section === "history" ? "History" :
                 section === "activity" ? "Activity" :
                 section === "premium" ? "Premium" :
                 section === "users" ? "Users" :
                 section === "elements" ? "Elements" : "Profile"}
              </h1>
              {section === "added" && canAddPlace ? (
                <Link
                  href={`/add?returnTo=${encodeURIComponent("/profile?section=added")}`}
                  className="w-10 h-10 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
                  aria-label="Add new place"
                >
                  <Icon name="add" size={20} className="text-[#1F2A1F]" />
                </Link>
              ) : (
                <div className="w-10" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={handleFiltersApply}
        appliedFilters={activeFilters}
        appliedCity={selectedCity}
        userAccess={access}
        // /profile редиректит на /map — TYPE-фильтр здесь не применяется,
        // чтобы не путать юзера фантомным выбором.
        hideKindFilter
        onCityChange={handleCityChange}
        getFilteredCount={async (draftFilters: ActiveFilters) => {
          // Since we redirect to /map, we don't need to count filtered places here
          // But we can still provide a count for better UX
          try {
            // For trips/added sections, count local places
            if (section === "trips" || section === "added") {
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
            }
            // For other sections, return 0 as we redirect to /map
            return 0;
          } catch (error: unknown) {
            console.error("Error in getFilteredCount:", {
              message: (error as Error)?.message,
              name: (error as Error)?.name,
              string: String(error),
            });
            return 0;
          }
        }}
      />

      <div className="pt-[64px] lg:pt-[80px]">
        {/* Desktop Layout */}
        <div className="hidden lg:flex min-h-[calc(100vh-80px)]">
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
                  <span>Added</span>
                </button>
                <button
                  onClick={() => setSection("premium")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "premium"
                      ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                      : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                  )}
                >
                  <Icon name="star" size={24} className="flex-shrink-0" />
                  <span className="flex-1">Premium</span>
                  {access?.plan && access.plan !== "free" && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide bg-[#8F9E4F] text-white rounded-full px-2 py-0.5">
                      Active
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setSection("history")}
                  className={cx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                    section === "history"
                      ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                      : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                  )}
                >
                  <Icon name="clock" size={24} className="flex-shrink-0" />
                  <span>History</span>
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
                  <Icon name="star" size={24} className="flex-shrink-0" />
                  <span>Activity</span>
                </button>
                {isAdmin && (
                  <>
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
                    <button
                      onClick={() => setSection("elements")}
                      className={cx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition",
                        section === "elements"
                          ? "bg-[#FAFAF7] text-[#1F2A1F] font-medium"
                          : "text-[#6F7A5A] hover:bg-[#FAFAF7]"
                      )}
                    >
                      <Icon name="package" size={24} className="flex-shrink-0" />
                      <span>Elements</span>
                    </button>
                    <Link
                      href="/admin/health"
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition text-[#6F7A5A] hover:bg-[#FAFAF7]"
                    >
                      <Icon name="activity" size={24} className="flex-shrink-0" />
                      <span>Health</span>
                    </Link>
                  </>
                )}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-8 py-8">
              {section === "about" && (
                <>
                  <AboutSection
                    profile={profile}
                    displayName={displayName}
                    stats={stats}
                    myWork={myWork}
                    bio={bioWithoutWork}
                    reviewsReceived={reviewsReceived}
                    reviewsWritten={reviewsWritten}
                    onEditClick={() => router.push("/profile/edit")}
                    onLogout={handleLogout}
                    loading={loading}
                    userRole={userRole}
                    subscriptionStatus={profile?.subscription_status}
                    isAdmin={userIsAdmin}
                    savedPlaces={saved}
                    addedPlaces={added}
                    recentlyViewedPlaces={recentlyViewed}
                    onSectionChange={setSection}
                  />
                </>
              )}
              {section === "trips" && (
                <TripsSection 
                  places={filteredSaved} 
                  loading={loading} 
                  userId={userId} 
                  onRemoveFavorite={(placeId) => {
                    setSaved((prev) => prev.filter((p) => p.id !== placeId));
                  }}
                  searchValue={searchValue}
                  selectedCity={selectedCity}
                  activeFilters={activeFilters}
                />
              )}
              {section === "added" && (
                <AddedPlacesSection 
                  places={filteredAdded} 
                  loading={loading}
                  searchValue={searchValue}
                  selectedCity={selectedCity}
                  activeFilters={activeFilters}
                  canAddPlace={canAddPlace}
                  onPlaceDeleted={(placeId) => {
                    setAdded((prev) => prev.filter((p) => p.id !== placeId));
                  }}
                />
              )}
              {section === "history" && (
                <HistorySection places={recentlyViewed} loading={loading} userId={userId} />
              )}
              {section === "activity" && (
                <ActivitySection activity={activity} loading={loading} profile={profile} displayName={displayName} />
              )}
              {section === "premium" && (
                <PremiumSection />
              )}
              {section === "users" && isAdmin && (
                <UsersSection loading={loading} currentUserId={userId} />
              )}
              {section === "elements" && isAdmin && (
                <ElementsSection />
              )}
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden">
          {section === "trips" || section === "added" || section === "history" || section === "activity" || section === "premium" || (section === "users" && isAdmin) || (section === "elements" && isAdmin) ? (
            // Show section content on mobile
            <div 
              className={`px-6 py-6 ${section === "activity" || section === "added" || (section === "users" && isAdmin) || (section === "elements" && isAdmin) ? "pt-[48px]" : "pt-[80px]"}`}
              style={{
                paddingBottom: 'calc(144px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {section === "trips" && (
                <TripsSection 
                  places={filteredSaved} 
                  loading={loading} 
                  userId={userId} 
                  onRemoveFavorite={(placeId) => {
                    setSaved((prev) => prev.filter((p) => p.id !== placeId));
                  }}
                  searchValue={searchValue}
                  selectedCity={selectedCity}
                  activeFilters={activeFilters}
                />
              )}
              {section === "added" && (
                <AddedPlacesSection 
                  places={filteredAdded} 
                  loading={loading}
                  searchValue={searchValue}
                  selectedCity={selectedCity}
                  activeFilters={activeFilters}
                  canAddPlace={canAddPlace}
                  onPlaceDeleted={(placeId) => {
                    setAdded((prev) => prev.filter((p) => p.id !== placeId));
                  }}
                />
              )}
              {section === "history" && (
                <HistorySection places={recentlyViewed} loading={loading} userId={userId} />
              )}
              {section === "activity" && (
                <ActivitySection activity={activity} loading={loading} profile={profile} displayName={displayName} />
              )}
              {section === "premium" && (
                <PremiumSection />
              )}
              {section === "users" && isAdmin && (
                <UsersSection loading={loading} currentUserId={userId} />
              )}
              {section === "elements" && isAdmin && (
                <ElementsSection />
              )}
            </div>
          ) : (
            // Show main mobile dashboard
            <div 
              className="px-6 py-6 space-y-4"
              style={{
                paddingBottom: 'calc(144px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {loading ? (
                <ProfileSkeleton />
              ) : (
                <>
                  {/* Profile Hero Card */}
                  <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm">
                    <div className="flex items-start gap-6">
                      {/* Left: Avatar, Name, Location (≈ 60%) */}
                      <div className="flex-shrink-0" style={{ width: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
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
                          <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
                            <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.placesAdded}</div>
                            <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.1' }}>Places added</div>
                          </div>
                          <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
                            <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.reviews}</div>
                            <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.1' }}>Comments</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
                            <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.favoritesCount}</div>
                            <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.1' }}>My favorites</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bio Card */}
                  {bioWithoutWork && (
                    <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm">
                      <h2 className="text-lg font-semibold font-fraunces text-[#1F2A1F] mb-3">About</h2>
                      <p className="text-sm text-[#1F2A1F] leading-relaxed whitespace-pre-line">{bioWithoutWork}</p>
                    </div>
                  )}

                  {/* Interests Card */}
                  {(profile?.favorite_categories?.length || profile?.favorite_tags?.length) ? (
                    <Link
                      href="/profile/edit/interests"
                      className="block bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm hover:shadow-md transition group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Interests</h2>
                        <Icon name="forward" size={18} className="text-[#6F7A5A] group-hover:text-[#1F2A1F] transition-colors flex-shrink-0" />
                      </div>
                      <div className="space-y-2">
                        {profile.favorite_categories && profile.favorite_categories.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {profile.favorite_categories.map((cat) => (
                              <span
                                key={cat}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4]"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                        {profile.favorite_tags && profile.favorite_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {profile.favorite_tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4]"
                              >
                                <span className="leading-none">{getTagEmoji(tag)}</span>
                                <span className="ml-1">{stripTagEmoji(tag)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  ) : null}

                  {/* Quick Access Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* My favorites */}
                    <button
                      onClick={() => setSection("trips")}
                      className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                    >
                      <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
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
                                {saved.length}
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
                      <div className="text-xs text-[#6F7A5A] text-center mt-0.5">{stats.favoritesCount} {stats.favoritesCount === 1 ? "place" : "places"}</div>
                    </button>

                    {/* Added places */}
                    <button
                      onClick={() => setSection("added")}
                      className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                    >
                      <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
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
                                {added.length}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="add" size={24} className="text-[#A8B096]" />
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#1F2A1F] text-center">Added</div>
                    </button>

                    {/* History */}
                    <button
                      onClick={() => setSection("history")}
                      className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                    >
                      <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
                        {recentlyViewed.length > 0 ? (
                          <div className="relative w-full h-full" style={{ padding: '8px' }}>
                            {/* Display up to 2 overlapping, rotated images */}
                            {recentlyViewed.slice(0, 2).map((place, index) => {
                              const rotation = index === 0 ? -5 : 5;
                              const offsetX = index === 0 ? -8 : 8;
                              const offsetY = index === 0 ? 0 : -5;
                              const zIndex = recentlyViewed.length - index;
                              
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
                            {recentlyViewed.length > 2 && (
                              <div 
                                className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-[#1F2A1F] badge-shadow z-10"
                                style={{ zIndex: 10 }}
                              >
                                {recentlyViewed.length}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="clock" size={24} className="text-[#A8B096]" />
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#1F2A1F] text-center">History</div>
                    </button>

                    {/* Activity */}
                    <button
                      onClick={() => setSection("activity")}
                      className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                    >
                      <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative flex items-center justify-center" style={{ minHeight: '120px' }}>
                        <Icon name="star" size={32} className="text-[#A8B096]" />
                      </div>
                      <div className="text-sm font-medium text-[#1F2A1F] text-center">Activity</div>
                    </button>

                    {/* Users - Admin only */}
                    {isAdmin && (
                      <button
                        onClick={() => setSection("users")}
                        className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                      >
                        <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative flex items-center justify-center" style={{ minHeight: '120px' }}>
                          <Icon name="users" size={32} className="text-[#A8B096]" />
                        </div>
                        <div className="text-sm font-medium text-[#1F2A1F] text-center">Users</div>
                      </button>
                    )}

                    {/* Elements - Admin only */}
                    {isAdmin && (
                      <button
                        onClick={() => setSection("elements")}
                        className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                      >
                        <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative flex items-center justify-center" style={{ minHeight: '120px' }}>
                          <Icon name="package" size={32} className="text-[#A8B096]" />
                        </div>
                        <div className="text-sm font-medium text-[#1F2A1F] text-center">Elements</div>
                      </button>
                    )}

                    {/* Health - Admin only */}
                    {isAdmin && (
                      <Link
                        href="/admin/health"
                        className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
                      >
                        <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative flex items-center justify-center" style={{ minHeight: '120px' }}>
                          <Icon name="activity" size={32} className="text-[#A8B096]" />
                        </div>
                        <div className="text-sm font-medium text-[#1F2A1F] text-center">Health</div>
                      </Link>
                    )}
                  </div>

                  {/* Mobile Edit & Logout Buttons */}
                  <div className="lg:hidden pt-4 border-t border-[#ECEEE4] mt-4 flex gap-3">
                    <Link
                      href="/profile/edit"
                      className="flex-1 rounded-lg bg-white border border-[#ECEEE4] text-[#1F2A1F] px-4 py-2.5 text-sm font-medium hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2"
                      aria-label="Edit profile"
                    >
                      <Icon name="edit" size={16} className="text-[#1F2A1F]" />
                      Edit profile
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex-1 rounded-lg bg-white border border-[#ECEEE4] text-[#C96A5B] px-4 py-2.5 text-sm font-medium hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2"
                    >
                      <Icon name="logout" size={16} className="text-[#C96A5B]" />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

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
  onLogout,
  loading,
  mobile = false,
  userRole,
  subscriptionStatus,
  isAdmin,
  savedPlaces,
  addedPlaces,
  recentlyViewedPlaces,
  onSectionChange,
}: {
  profile: Profile | null;
  displayName: string;
  stats: { placesAdded: number; reviews: number; favoritesCount: number };
  myWork: string | null;
  bio: string | null;
  reviewsReceived: Review[];
  reviewsWritten: Review[];
  onEditClick: () => void;
  onLogout?: () => void;
  loading: boolean;
  mobile?: boolean;
  userRole?: string | null;
  subscriptionStatus?: string | null;
  isAdmin?: boolean;
  savedPlaces?: Place[];
  addedPlaces?: Place[];
  recentlyViewedPlaces?: Place[];
  onSectionChange?: (section: "trips" | "added" | "history") => void;
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
        <div className="flex items-center gap-3">
          <button
            onClick={onEditClick}
            className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
          >
            Edit
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white text-sm font-medium text-[#C96A5B] hover:bg-[#FAFAF7] transition flex items-center gap-2"
            >
              <Icon name="logout" size={16} className="text-[#C96A5B]" />
              Log out
            </button>
          )}
        </div>
      </div>

      {/* Hero Card */}
      <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm mb-8">
        <div className="flex items-start gap-6">
          {/* Left: Avatar, Name, Location (≈ 60%) */}
          <div className="flex-shrink-0" style={{ width: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
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
              <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
                <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.placesAdded}</div>
                <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.1' }}>Places added</div>
              </div>
              <div style={{ borderBottom: '1px solid #ECEEE4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
                <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.reviews}</div>
                <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.1' }}>Comments</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
                <div className="text-[#1F2A1F] m-0" style={{ fontWeight: 600, fontSize: '19px', lineHeight: '1.1' }}>{stats.favoritesCount}</div>
                <div className="m-0 text-[#6F7A5A]" style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.1' }}>My favorites</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bio Card */}
      {bio && (
        <div className="bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm mb-8">
          <h2 className="text-lg font-semibold font-fraunces text-[#1F2A1F] mb-3">About</h2>
          <p className="text-sm text-[#1F2A1F] leading-relaxed whitespace-pre-line">{bio}</p>
        </div>
      )}

      {/* Interests Card */}
      {(profile?.favorite_categories?.length || profile?.favorite_tags?.length) ? (
        <Link
          href="/profile/edit/interests"
          className="block bg-white rounded-[24px] p-6 border border-[#ECEEE4] shadow-sm mb-8 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Interests</h2>
            <Icon name="forward" size={18} className="text-[#6F7A5A] group-hover:text-[#1F2A1F] transition-colors flex-shrink-0" />
          </div>
          <div className="space-y-2">
            {profile.favorite_categories && profile.favorite_categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.favorite_categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4]"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}
            {profile.favorite_tags && profile.favorite_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.favorite_tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4]"
                  >
                    <span className="leading-none">{getTagEmoji(tag)}</span>
                    <span className="ml-1">{stripTagEmoji(tag)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Link>
      ) : null}

      {/* Quick Access Cards - Desktop only, right after Hero Card */}
      {!mobile && savedPlaces !== undefined && addedPlaces !== undefined && recentlyViewedPlaces !== undefined && onSectionChange && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* My favorites */}
          <button
            onClick={() => onSectionChange("trips")}
            className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
          >
            <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
              {savedPlaces.length > 0 ? (
                <div className="relative w-full h-full" style={{ padding: '8px' }}>
                  {/* Display up to 2 overlapping, rotated images */}
                  {savedPlaces.slice(0, 2).map((place, index) => {
                    const rotation = index === 0 ? -5 : 5;
                    const offsetX = index === 0 ? -8 : 8;
                    const offsetY = index === 0 ? 0 : -5;
                    const zIndex = savedPlaces.length - index;
                    
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
                  {savedPlaces.length > 2 && (
                    <div 
                      className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-[#1F2A1F] badge-shadow z-10"
                      style={{ zIndex: 10 }}
                    >
                      {savedPlaces.length}
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
            <div className="text-xs text-[#6F7A5A] text-center mt-0.5">{stats.favoritesCount} {stats.favoritesCount === 1 ? "place" : "places"}</div>
          </button>

          {/* Added places */}
          <button
            onClick={() => onSectionChange("added")}
            className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
          >
            <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
              {addedPlaces.length > 0 ? (
                <div className="relative w-full h-full" style={{ padding: '8px' }}>
                  {/* Display up to 2 overlapping, rotated images */}
                  {addedPlaces.slice(0, 2).map((place, index) => {
                    const rotation = index === 0 ? -5 : 5;
                    const offsetX = index === 0 ? -8 : 8;
                    const offsetY = index === 0 ? 0 : -5;
                    const zIndex = addedPlaces.length - index;
                    
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
                  {addedPlaces.length > 2 && (
                    <div 
                      className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-[#1F2A1F] badge-shadow z-10"
                      style={{ zIndex: 10 }}
                    >
                      {addedPlaces.length}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon name="add" size={24} className="text-[#A8B096]" />
                </div>
              )}
            </div>
            <div className="text-sm font-medium text-[#1F2A1F] text-center">Added</div>
          </button>

          {/* History */}
          <button
            onClick={() => onSectionChange("history")}
            className="bg-white rounded-2xl border border-[#ECEEE4] p-4 shadow-sm hover:shadow-md transition group"
          >
            <div className="aspect-square rounded-xl overflow-visible bg-white mb-3 relative" style={{ minHeight: '120px' }}>
              {recentlyViewedPlaces.length > 0 ? (
                <div className="relative w-full h-full" style={{ padding: '8px' }}>
                  {/* Display up to 2 overlapping, rotated images */}
                  {recentlyViewedPlaces.slice(0, 2).map((place, index) => {
                    const rotation = index === 0 ? -5 : 5;
                    const offsetX = index === 0 ? -8 : 8;
                    const offsetY = index === 0 ? 0 : -5;
                    const zIndex = recentlyViewedPlaces.length - index;
                    
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
                  {recentlyViewedPlaces.length > 2 && (
                    <div 
                      className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-[#1F2A1F] badge-shadow z-10"
                      style={{ zIndex: 10 }}
                    >
                      {recentlyViewedPlaces.length}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon name="clock" size={24} className="text-[#A8B096]" />
                </div>
              )}
            </div>
            <div className="text-sm font-medium text-[#1F2A1F] text-center">History</div>
          </button>
        </div>
      )}

      {/* My work */}
      {myWork && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="briefcase" size={20} className="text-[#6F7A5A]" />
            <span className="font-semibold text-[#1F2A1F]">My work: {myWork}</span>
          </div>
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

    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const isDesktop = useIsDesktop();
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
        <Link href={`/id/${review.place_id}`} target={isDesktop ? "_blank" : undefined} rel={isDesktop ? "noopener noreferrer" : undefined} className="text-sm text-[#6F7A5A] hover:text-[#1F2A1F] transition">
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
  const { access } = useUserAccessContext();
  const isDesktop = useIsDesktop();

  // Calculate locked premium places for Haunted Gem indexing (hooks must not be conditional)
  const defaultUserAccess: UserAccess = access ?? {
    role: "guest",
    hasPremium: false,
    isAdmin: false,
  };

  const lockedPlacesMap = useMemo(() => {
    const lockedPlaces = places
      .filter((p) => {
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

    const map = new Map<string, number>();
    lockedPlaces.forEach((p, idx) => {
      map.set(p.id, idx + 1);
    });
    return map;
  }, [places, defaultUserAccess, userId]);

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
      <div>
        <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">My favorites</h1>
        <div className="text-center py-16 text-[#6F7A5A]">
          {hasFilters ? "No places match your filters" : "No saved places yet"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">My favorites</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
  activeFilters,
  canAddPlace = false,
  onPlaceDeleted
}: { 
  places: Place[]; 
  loading: boolean;
  searchValue?: string;
  selectedCity?: string | null;
  activeFilters?: ActiveFilters;
  canAddPlace?: boolean;
  onPlaceDeleted?: (placeId: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { access, user } = useUserAccessContext();
  const isDesktop = useIsDesktop();
  const [deletingPlaceId, setDeletingPlaceId] = useState<string | null>(null);
  const [menuOpenPlaceId, setMenuOpenPlaceId] = useState<string | null>(null);
  const [deleteConfirmPlace, setDeleteConfirmPlace] = useState<{ id: string; title: string } | null>(null);

  function openDeletePlaceConfirm(placeId: string, placeTitle: string) {
    setDeleteConfirmPlace({ id: placeId, title: placeTitle || "this place" });
  }

  function closeDeletePlaceConfirm() {
    setDeleteConfirmPlace(null);
  }

  async function confirmDeletePlace(placeId: string) {
    if (!user) return;
    setDeletingPlaceId(placeId);
    setDeleteConfirmPlace(null);

    try {
      // Step 1: Get all photos to delete from storage
      const { data: rawPhotos } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", placeId);

      const photosData = rawPhotos as PlacePhotoUrlRow[] | null;
      // Step 2: Delete photos from storage (if they exist in storage bucket)
      if (photosData && photosData.length > 0) {
        const photoUrls = photosData.map((p) => p.url).filter(Boolean) as string[];
        const bucketName = 'place-photos';
        
        for (const url of photoUrls) {
          try {
            if (url.includes('supabase.co/storage')) {
              const storageMatch = url.match(/\/place-photos\/(.+)$/);
              if (storageMatch && storageMatch[1]) {
                const filePath = storageMatch[1];
                const { error: storageError } = await supabase.storage
                  .from(bucketName)
                  .remove([filePath]);
                
                if (storageError) {
                  console.warn(`Failed to delete photo from storage: ${filePath}`, storageError);
                }
              }
            }
          } catch (storageErr) {
            console.warn("Error deleting photo from storage:", storageErr);
          }
        }
      }

      // Step 3: Delete related data from database
      const [photosResult, commentsResult, reactionsResult] = await Promise.all([
        supabase.from("place_photos").delete().eq("place_id", placeId),
        supabase.from("comments").delete().eq("place_id", placeId),
        supabase.from("reactions").delete().eq("place_id", placeId),
      ]);

      if (photosResult.error) {
        console.warn("Error deleting place_photos:", photosResult.error);
      }
      if (commentsResult.error) {
        console.warn("Error deleting comments:", commentsResult.error);
      }
      if (reactionsResult.error) {
        console.warn("Error deleting reactions:", reactionsResult.error);
      }

      // Step 4: Delete the place itself
      const currentIsAdmin = isUserAdmin(access);
      const deleteQuery = supabase
        .from("places")
        .delete()
        .eq("id", placeId);
      
      if (!currentIsAdmin) {
        deleteQuery.eq("created_by", user.id);
      }
      
      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        console.error("Delete error:", deleteError);
        alert(deleteError.message || "Failed to delete place");
        setDeletingPlaceId(null);
        return;
      }

      // Call callback to update parent state
      if (onPlaceDeleted) {
        onPlaceDeleted(placeId);
      }
    } catch (err) {
      console.error("Exception deleting place:", err);
      alert(err instanceof Error ? err.message : "Failed to delete place");
    } finally {
      setDeletingPlaceId(null);
    }
  }

  async function handleDelete(placeId: string, placeTitle: string) {
    openDeletePlaceConfirm(placeId, placeTitle);
  }

  async function handleConfirmDeletePlace() {
    if (!deleteConfirmPlace) return;
    await confirmDeletePlace(deleteConfirmPlace.id);
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
      <div>
        {/* Header with title and Add place button */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F]">Added</h1>
          {canAddPlace && (
            <Link
              href={`/add?returnTo=${encodeURIComponent(pathname)}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#7A8A42] transition-colors"
            >
              <Icon name="add" size={20} />
              <span>Add place</span>
            </Link>
          )}
        </div>

        {hasFilters ? (
          <div className="text-center py-16 text-[#6F7A5A]">No places match your filters</div>
        ) : canAddPlace ? (
          <div className="text-center py-16 text-[#6F7A5A]">You haven&apos;t added any places yet</div>
        ) : (
          // No paid plan — send the user to the Premium tab to upgrade.
          <div className="max-w-md mx-auto rounded-2xl border border-[#ECEEE4] bg-white p-6 text-center">
            <div className="text-3xl mb-3" aria-hidden>🗝</div>
            <div className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
              You need a plan to add places
            </div>
            <p className="text-sm text-[#6F7A5A] mb-5">
              Premium unlocks creating locations and access to hidden places. Pro plans also let you publish services and experiences.
            </p>
            <button
              type="button"
              onClick={() => router.push(`${pathname}?section=premium`)}
              className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition"
            >
              See Premium
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header with title and Add place button */}
      <div className="hidden lg:flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F]">Added</h1>
        {canAddPlace && (
            <Link
              href={`/add?returnTo=${encodeURIComponent(pathname)}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#7A8A42] transition-colors"
            >
              <Icon name="add" size={20} />
              <span>Add place</span>
            </Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {places.map((place) => {
          const isPremium = isPlacePremium(place);
          const isMenuOpen = menuOpenPlaceId === place.id;
          return (
            <div key={place.id} className="group relative">
              <Link href={`/id/${place.id}`} target={isDesktop ? "_blank" : undefined} rel={isDesktop ? "noopener noreferrer" : undefined}>
                <div className="aspect-square rounded-xl overflow-hidden bg-[#FAFAF7] mb-2 relative">
                  {place.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={place.cover_url}
                      alt={place.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-[#A8B096]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {/* Premium Badge */}
                  {isPremium && (
                    <div className="absolute top-2 left-2 z-20">
                      <PremiumBadge />
                    </div>
                  )}
                  {/* Mobile 3-dots menu button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpenPlaceId(isMenuOpen ? null : place.id);
                    }}
                    className="lg:hidden absolute top-2 right-2 z-30 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-sm hover:bg-white transition-colors"
                    aria-label="More options"
                  >
                    <Icon name="more-vertical" size={20} className="text-[#1F2A1F]" />
                  </button>
                  {/* Edit and Delete buttons - appear on hover (desktop only) */}
                  <div className="hidden lg:flex absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 gap-2 z-10">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/places/${place.id}/edit`);
                      }}
                      className="bg-white/90 backdrop-blur-sm rounded-lg p-2 badge-shadow hover:bg-white transition-colors"
                      aria-label="Edit place"
                    >
                      <Icon name="edit" size={20} className="text-[#1F2A1F]" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(place.id, place.title);
                      }}
                      disabled={deletingPlaceId === place.id}
                      className="bg-white/90 backdrop-blur-sm rounded-lg p-2 badge-shadow hover:bg-white transition-colors disabled:opacity-50"
                      aria-label="Delete place"
                    >
                      <Icon name="delete" size={20} className="text-[#C96A5B]" />
                    </button>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium font-fraunces text-[#1F2A1F] mb-1 line-clamp-1">{place.title}</h3>
                  {place.city && <p className="text-xs text-[#6F7A5A]">{place.city}</p>}
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Mobile Action Sheet */}
      {menuOpenPlaceId && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpenPlaceId(null)}
          />
          
          {/* Bottom Sheet */}
          <div
            className="relative w-full bg-white rounded-t-2xl shadow-xl flex flex-col border-t border-[#ECEEE4] animate-slide-up"
            style={{
              maxHeight: '50vh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-[#ECEEE4] rounded-full" />
            </div>
            
            {/* Menu items */}
            <div className="px-6 py-2">
              {places.find(p => p.id === menuOpenPlaceId) && (
                <>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const place = places.find(p => p.id === menuOpenPlaceId);
                      if (place) {
                        router.push(`/places/${place.id}/edit`);
                        setMenuOpenPlaceId(null);
                      }
                    }}
                    className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-[#FAFAF7] rounded-xl transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#F4F6EF] flex items-center justify-center flex-shrink-0">
                      <Icon name="edit" size={20} className="text-[#8F9E4F]" />
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-medium text-[#1F2A1F]">Edit place</div>
                    </div>
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const place = places.find(p => p.id === menuOpenPlaceId);
                      if (place) {
                        handleDelete(place.id, place.title);
                        setMenuOpenPlaceId(null);
                      }
                    }}
                    disabled={deletingPlaceId === menuOpenPlaceId}
                    className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-[#FAFAF7] rounded-xl transition-colors disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#FEF2F0] flex items-center justify-center flex-shrink-0">
                      <Icon name="delete" size={20} className="text-[#C96A5B]" />
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-medium text-[#C96A5B]">
                        {deletingPlaceId === menuOpenPlaceId ? "Deleting..." : "Delete place"}
                      </div>
                    </div>
                  </button>
                </>
              )}
            </div>
            
            {/* Cancel button */}
            <div className="px-6 pb-4 pt-2 border-t border-[#ECEEE4]">
              <button
                onClick={() => setMenuOpenPlaceId(null)}
                className="w-full py-3 text-base font-medium text-[#6F7A5A] hover:text-[#1F2A1F] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete place confirmation modal */}
      {deleteConfirmPlace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-place-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6">
            <h2 id="delete-place-modal-title" className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
              Delete place
            </h2>
            <p className="text-sm text-[#6F7A5A] mb-6">
              Are you sure you want to delete <strong className="text-[#1F2A1F]">{deleteConfirmPlace.title}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeDeletePlaceConfirm}
                className="px-4 py-2.5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePlace}
                className="px-4 py-2.5 rounded-xl bg-[#C96A5B] text-white text-sm font-medium hover:bg-[#B85A4B] transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
        <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Activity</h1>
        <div className="text-center py-16 text-[#6F7A5A]">No activity yet</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Activity</h1>
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

function HistorySection({ 
  places, 
  loading,
  userId
}: { 
  places: Place[]; 
  loading: boolean;
  userId?: string | null;
}) {
  const { access } = useUserAccessContext();

  // Calculate locked premium places for Haunted Gem indexing (hooks must not be conditional)
  const defaultUserAccess: UserAccess = access ?? {
    role: "guest",
    hasPremium: false,
    isAdmin: false,
  };

  const lockedPlacesMap = useMemo(() => {
    const lockedPlaces = places
      .filter((p) => {
        const pIsPremium = isPlacePremium(p);
        const pCanView = canUserViewPlace(defaultUserAccess, p);
        const pIsOwner = userId != null && p.created_by === userId;
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

    const map = new Map<string, number>();
    lockedPlaces.forEach((p, idx) => {
      map.set(p.id, idx + 1);
    });
    return map;
  }, [places, defaultUserAccess, userId]);

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
    return (
      <div>
        <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">History</h1>
        <div className="text-center py-16 text-[#6F7A5A]">No recently viewed places</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">History</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {places.map((place) => {
          const hauntedGemIndex = lockedPlacesMap.get(place.id);
          return (
            <PlaceCard
              key={place.id}
              place={place}
              userAccess={access}
              userId={userId ?? undefined}
              hauntedGemIndex={hauntedGemIndex}
            />
          );
        })}
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
  // Новые поля для работы с тарифами
  plan: string | null;
  plan_period: string | null;
  created_at: string;
};

/**
 * Опции, которые админ может назначить юзеру.
 * 'admin' — отдельный slot (is_admin=true). Остальные — конкретные планы.
 */
type AdminAssignable =
  | "admin"
  | "free"
  | "premium_viewer"
  | "creator_service"
  | "creator_experience"
  | "creator_all";

const ADMIN_OPTIONS: { value: AdminAssignable; label: string }[] = [
  { value: "free",               label: "Free" },
  { value: "premium_viewer",     label: "Premium" },
  { value: "creator_service",    label: "Pro Service" },
  { value: "creator_experience", label: "Pro Experience" },
  { value: "creator_all",        label: "Pro All-in" },
  { value: "admin",              label: "Admin" },
];

/** Текущее значение dropdown'а — admin побеждает план. */
function currentAdminAssignable(u: User): AdminAssignable {
  if (u.is_admin) return "admin";
  const plan = u.plan as AdminAssignable | null;
  if (plan && plan !== "admin") return plan;
  // Legacy fallback: если plan ещё не выставлен — выводим из subscription_status
  if (u.subscription_status === "active") return "premium_viewer";
  return "free";
}

function ElementsSection() {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Default values
  const defaultContent = {
    title: "Unlock Maporia Premium",
    titleHighlight: "Maporia",
    subtitle: "Get full access to our hidden local gems — no crowds, no tourist traps. Just authentic experiences.",
    benefit1Title: "Premium-only places",
    benefit1Desc: "Exclusive access to local secrets and hidden spots.",
    benefit2Title: "Curated Collections",
    benefit2Desc: "Secret Spots, Romantic Sunsets, Hidden Cafés & more.",
    benefit3Title: "Custom Routes",
    benefit3Desc: "Save favorites and build your personal itinerary.",
    socialProof: "Discover places you'd never find on Google.",
    price: "$20",
    pricePeriod: "/ year",
    priceSubtext: "Less than $2 a month",
    priceRightTitle: "Full Access",
    priceRightDesc: "All premium places + collections",
    primaryButtonText: "Get Premium",
    primaryButtonLink: "",
    secondaryButtonText: "Not now, thanks",
    footerText: "One-time payment. Premium features unlock instantly.",
    footerLinkText: "Terms of Service apply.",
    footerLinkUrl: "#",
  };

  const [modalContent, setModalContent] = useState(defaultContent);
  const { openPremiumModal } = usePremiumModalContext();

  // Load settings from API
  useEffect(() => {
    async function loadSettings() {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setIsLoading(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch("/api/admin/premium-modal-settings", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (data.settings) {
              setModalContent({ ...defaultContent, ...data.settings });
            }
          } else {
            console.error("API returned non-JSON response");
          }
        } else {
          // If not OK (e.g. 401/403), try to get error message
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            try {
              const errBody = await response.json();
              const msg = errBody?.error || response.statusText || "Unknown error";
              if (process.env.NODE_ENV === 'production') {
                console.warn("Premium modal settings not available:", msg);
              } else {
                console.error("Error loading premium modal settings:", msg);
              }
            } catch (parseError) {
              console.error("Error loading premium modal settings:", response.status, response.statusText);
            }
          } else {
            console.error("Error loading premium modal settings:", response.status, response.statusText);
          }
        }
      } catch (error: any) {
        // Silently ignore AbortError, network/connection errors (Failed to fetch, offline, CORS)
        const msg = String(error?.message ?? '');
        const isNetwork = error?.name === 'AbortError' || msg.includes('abort') || error?.code === 'ECONNABORTED' ||
          msg.includes('Failed to fetch') || msg.includes('NetworkError') || (error?.name === 'TypeError' && msg.toLowerCase().includes('fetch'));
        if (isNetwork) {
          setIsLoading(false);
          return;
        }
        // Log with a guaranteed non-empty message so we never log "{}"
        const logMsg = msg || error?.name || error?.code || (typeof error === 'object' ? 'Unknown error' : String(error));
        if (process.env.NODE_ENV === 'production') {
          console.warn("Premium modal settings not available:", logMsg);
        } else {
          console.error("Error loading premium modal settings:", logMsg);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Save settings to API
  async function handleSave() {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("You must be logged in to save settings");
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for save
      
      const response = await fetch("/api/admin/premium-modal-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ settings: modalContent }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data.success) {
            setSaveSuccess(true);
            setIsEditing(false);
            setTimeout(() => setSaveSuccess(false), 3000);
          } else {
            throw new Error(data.error || "Failed to save settings");
          }
        } else {
          throw new Error("Received unexpected response format");
        }
      } else {
        const contentType = response.headers.get("content-type");
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const error = await response.json();
            // Use details if available, otherwise error, otherwise fallback
            errorMessage = error.details || error.error || errorMessage;
            
            // Special handling for table not found
            if (error.code === "TABLE_NOT_FOUND") {
              errorMessage = "Database table not found. Please run create-premium-modal-settings-table.sql in Supabase SQL Editor.";
            }
          } catch (e) {
            // If JSON parsing fails, use status text
            console.error("Failed to parse error response:", e);
          }
        } else {
          const text = await response.text();
          console.error("Non-JSON error response:", text.substring(0, 200));
        }
        
        alert(errorMessage);
      }
    } catch (error) {
      // Silently ignore AbortError
      if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('abort'))) {
        return;
      }
      // Only show error for non-abort errors
      const errorMessage = error instanceof Error ? error.message : "Failed to save settings. Please try again.";
      if (process.env.NODE_ENV === 'production') {
        console.warn("Error saving premium modal settings:", errorMessage);
      } else {
        console.error("Error saving premium modal settings:", error);
      }
      alert(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="hidden lg:flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F]">Elements</h1>
      </div>

      <div className="space-y-6">
        {/* Premium Upsell Modal Editor */}
        <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Premium Upsell Modal</h3>
              <p className="text-sm text-[#6F7A5A]">Used when non-premium users try to access premium content</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-medium text-sm hover:bg-[#FAFAF7] transition-colors flex items-center gap-2"
              >
                <Icon name="edit" size={16} />
                {isEditing ? "Cancel" : "Edit"}
              </button>
              <button
                onClick={() => openPremiumModal("place", undefined, undefined, modalContent)}
                className="px-4 py-2 rounded-xl bg-[#8F9E4F] text-white font-medium text-sm hover:brightness-110 transition-colors"
              >
                Preview
              </button>
            </div>
          </div>

          {/* Editor Form */}
          {isEditing && (
            <div className="mt-6 p-6 bg-[#FAFAF7] rounded-xl border border-[#ECEEE4] space-y-6">
              {saveSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
                  Settings saved successfully! Changes will apply to all premium modal windows.
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Title</label>
                  <input
                    type="text"
                    value={modalContent.title}
                    onChange={(e) => setModalContent({ ...modalContent, title: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                
                {/* Title Highlight */}
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Title Highlight (word to emphasize)</label>
                  <input
                    type="text"
                    value={modalContent.titleHighlight}
                    onChange={(e) => setModalContent({ ...modalContent, titleHighlight: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>

                {/* Subtitle */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Subtitle</label>
                  <textarea
                    value={modalContent.subtitle}
                    onChange={(e) => setModalContent({ ...modalContent, subtitle: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] resize-none"
                  />
                </div>

                {/* Benefits */}
                <div className="lg:col-span-2">
                  <h4 className="text-sm font-semibold text-[#1F2A1F] mb-3">Benefits</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 1 - Title</label>
                        <input
                          type="text"
                          value={modalContent.benefit1Title}
                          onChange={(e) => setModalContent({ ...modalContent, benefit1Title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 1 - Description</label>
                        <input
                          type="text"
                          value={modalContent.benefit1Desc}
                          onChange={(e) => setModalContent({ ...modalContent, benefit1Desc: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 2 - Title</label>
                        <input
                          type="text"
                          value={modalContent.benefit2Title}
                          onChange={(e) => setModalContent({ ...modalContent, benefit2Title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 2 - Description</label>
                        <input
                          type="text"
                          value={modalContent.benefit2Desc}
                          onChange={(e) => setModalContent({ ...modalContent, benefit2Desc: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 3 - Title</label>
                        <input
                          type="text"
                          value={modalContent.benefit3Title}
                          onChange={(e) => setModalContent({ ...modalContent, benefit3Title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 3 - Description</label>
                        <input
                          type="text"
                          value={modalContent.benefit3Desc}
                          onChange={(e) => setModalContent({ ...modalContent, benefit3Desc: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Social Proof */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Social Proof</label>
                  <input
                    type="text"
                    value={modalContent.socialProof}
                    onChange={(e) => setModalContent({ ...modalContent, socialProof: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price</label>
                  <input
                    type="text"
                    value={modalContent.price}
                    onChange={(e) => setModalContent({ ...modalContent, price: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Period</label>
                  <input
                    type="text"
                    value={modalContent.pricePeriod}
                    onChange={(e) => setModalContent({ ...modalContent, pricePeriod: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Subtext</label>
                  <input
                    type="text"
                    value={modalContent.priceSubtext}
                    onChange={(e) => setModalContent({ ...modalContent, priceSubtext: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Right Title</label>
                  <input
                    type="text"
                    value={modalContent.priceRightTitle}
                    onChange={(e) => setModalContent({ ...modalContent, priceRightTitle: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Right Description</label>
                  <input
                    type="text"
                    value={modalContent.priceRightDesc}
                    onChange={(e) => setModalContent({ ...modalContent, priceRightDesc: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>

                {/* Buttons */}
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Primary Button Text</label>
                  <input
                    type="text"
                    value={modalContent.primaryButtonText}
                    onChange={(e) => setModalContent({ ...modalContent, primaryButtonText: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Primary Button Link (URL)</label>
                  <input
                    type="text"
                    value={modalContent.primaryButtonLink}
                    onChange={(e) => setModalContent({ ...modalContent, primaryButtonLink: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Secondary Button Text</label>
                  <input
                    type="text"
                    value={modalContent.secondaryButtonText}
                    onChange={(e) => setModalContent({ ...modalContent, secondaryButtonText: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>

                {/* Footer */}
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Footer Text</label>
                  <textarea
                    value={modalContent.footerText}
                    onChange={(e) => setModalContent({ ...modalContent, footerText: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Footer Link Text</label>
                  <input
                    type="text"
                    value={modalContent.footerLinkText}
                    onChange={(e) => setModalContent({ ...modalContent, footerLinkText: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Footer Link URL</label>
                  <input
                    type="text"
                    value={modalContent.footerLinkUrl}
                    onChange={(e) => setModalContent({ ...modalContent, footerLinkUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  />
                </div>
              </div>
              
              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[#ECEEE4]">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2.5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-medium text-sm hover:bg-[#FAFAF7] transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#8F9E4F] text-white font-medium text-sm hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={16} />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collections (Admin CRUD) */}
        <Link
          href="/admin/collections"
          className="block rounded-xl border border-[#ECEEE4] bg-white p-6 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                <Icon name="grid" size={24} className="text-[#8F9E4F]" />
              </div>
              <div>
                <div className="font-semibold text-[#1F2A1F] mb-1">Collections</div>
                <div className="text-sm text-[#6F7A5A]">Create and manage curated place collections (free / premium)</div>
              </div>
            </div>
            <Icon name="forward" size={20} className="text-[#A8B096] group-hover:text-[#6F7A5A] transition" />
          </div>
        </Link>

        {/* Edit Tags */}
        <Link
          href="/profile/elements/tags"
          className="block rounded-xl border border-[#ECEEE4] bg-white p-6 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                <Icon name="list" size={24} className="text-[#8F9E4F]" />
              </div>
              <div>
                <div className="font-semibold text-[#1F2A1F] mb-1">Edit Tags</div>
                <div className="text-sm text-[#6F7A5A]">Manage tags used across all places</div>
              </div>
            </div>
            <Icon name="forward" size={20} className="text-[#A8B096] group-hover:text-[#6F7A5A] transition" />
          </div>
        </Link>

        {/* Stats Banner — homepage live counters */}
        <Link
          href="/profile/elements/stats-banner"
          className="block rounded-xl border border-[#ECEEE4] bg-white p-6 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                <Icon name="users" size={24} className="text-[#8F9E4F]" />
              </div>
              <div>
                <div className="font-semibold text-[#1F2A1F] mb-1">Stats Banner</div>
                <div className="text-sm text-[#6F7A5A]">Homepage counters: users · locations · services · experiences</div>
              </div>
            </div>
            <Icon name="forward" size={20} className="text-[#A8B096] group-hover:text-[#6F7A5A] transition" />
          </div>
        </Link>

        {/* Brand Guide */}
        <Link
          href="/brand-guide"
          className="block rounded-xl border border-[#ECEEE4] bg-white p-6 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                <Icon name="package" size={24} className="text-[#8F9E4F]" />
              </div>
              <div>
                <div className="font-semibold text-[#1F2A1F] mb-1">Brand Guide</div>
                <div className="text-sm text-[#6F7A5A]">Complete design system and brand guidelines</div>
              </div>
            </div>
            <Icon name="forward" size={20} className="text-[#A8B096] group-hover:text-[#6F7A5A] transition" />
          </div>
        </Link>

        {/* Impersonation log */}
        <Link
          href="/admin/impersonation-log"
          className="block rounded-xl border border-[#ECEEE4] bg-white p-6 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                <Icon name="eye" size={24} className="text-[#8F9E4F]" />
              </div>
              <div>
                <div className="font-semibold text-[#1F2A1F] mb-1">Impersonation log</div>
                <div className="text-sm text-[#6F7A5A]">Аудит сессий, когда админы входили под пользователями</div>
              </div>
            </div>
            <Icon name="forward" size={20} className="text-[#A8B096] group-hover:text-[#6F7A5A] transition" />
          </div>
        </Link>
      </div>

    </div>
  );
}

function UsersSection({ loading, currentUserId }: { loading: boolean; currentUserId: string | null }) {
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Map<string, AdminAssignable>>(new Map());

  // Admin manage modal state (edit email / password / send reset / send magic link).
  // Один объект = одна модалка; держим её локальной, чтобы не плодить пропсы.
  const [manageUserId, setManageUserId] = useState<string | null>(null);
  const [manageEmail, setManageEmail] = useState<string>("");
  const [managePassword, setManagePassword] = useState<string>("");
  const [manageBusyAction, setManageBusyAction] = useState<null | "email" | "password" | "reset" | "magic">(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSuccess, setManageSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  // Helper: вызов admin auth API с Bearer-токеном текущей сессии.
  // Возвращает { ok, data?, error? }, ошибку логируем и кладём в manageError.
  async function callAdminAuthApi(
    targetId: string,
    action: "set_email" | "set_password" | "send_reset_link" | "send_magic_link",
    payload: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    if (sessionErr || !session) {
      return { ok: false, error: "Не удалось получить admin-сессию" };
    }
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetId)}/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: body?.error || `HTTP ${res.status}` };
      }
      return { ok: true, data: body };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  async function openManageModal(user: User) {
    setManageUserId(user.id);
    setManageEmail(user.email || "");
    setManagePassword("");
    setManageBusyAction(null);
    setManageError(null);
    setManageSuccess(null);

    // Подтягиваем актуальный email с сервера (в списке он всегда null —
    // его нельзя отдать клиенту через RLS из profiles).
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/auth`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.email && typeof body.email === "string") {
        setManageEmail(body.email);
        // Заодно обновим карточку в списке, чтобы targetEmail был не пустой.
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, email: body.email } : u))
        );
      }
    } catch {
      // молча — модалка работает и без prefill.
    }
  }

  function closeManageModal() {
    setManageUserId(null);
    setManageEmail("");
    setManagePassword("");
    setManageBusyAction(null);
    setManageError(null);
    setManageSuccess(null);
  }

  async function manageSetEmail() {
    if (!manageUserId) return;
    setManageBusyAction("email");
    setManageError(null);
    setManageSuccess(null);
    const r = await callAdminAuthApi(manageUserId, "set_email", { email: manageEmail.trim() });
    setManageBusyAction(null);
    if (!r.ok) {
      setManageError(r.error || "Не удалось обновить email");
      return;
    }
    setManageSuccess("Email обновлён");
    await loadUsers();
  }

  async function manageSetPassword() {
    if (!manageUserId) return;
    if (managePassword.length < 8) {
      setManageError("Пароль должен быть минимум 8 символов");
      return;
    }
    setManageBusyAction("password");
    setManageError(null);
    setManageSuccess(null);
    const r = await callAdminAuthApi(manageUserId, "set_password", { password: managePassword });
    setManageBusyAction(null);
    if (!r.ok) {
      setManageError(r.error || "Не удалось задать пароль");
      return;
    }
    setManagePassword("");
    setManageSuccess("Пароль обновлён");
  }

  async function manageSendResetLink() {
    if (!manageUserId) return;
    setManageBusyAction("reset");
    setManageError(null);
    setManageSuccess(null);
    const r = await callAdminAuthApi(manageUserId, "send_reset_link");
    setManageBusyAction(null);
    if (!r.ok) {
      setManageError(r.error || "Не удалось отправить ссылку");
      return;
    }
    setManageSuccess("Ссылка для сброса пароля отправлена");
  }

  async function manageSendMagicLink() {
    if (!manageUserId) return;
    setManageBusyAction("magic");
    setManageError(null);
    setManageSuccess(null);
    const r = await callAdminAuthApi(manageUserId, "send_magic_link");
    setManageBusyAction(null);
    if (!r.ok) {
      setManageError(r.error || "Не удалось отправить magic-link");
      return;
    }
    setManageSuccess("Magic-link отправлен");
  }

  async function loadUsers() {
    setUsersLoading(true);
    setError(null);
    
    try {
      // Load all profiles (admin can see all users)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, role, is_admin, subscription_status, plan, plan_period, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) {
        console.error("Error loading users:", profilesError);
        setError("Failed to load users");
        return;
      }

      // Try to get emails from auth.users via RPC or use profiles data
      // Note: Email might not be available on client-side without admin API
      const profilesList = (profiles || []) as Array<ProfileRow & { plan?: string | null; plan_period?: string | null }>;
      const usersWithData: User[] = profilesList.map(profile => ({
        id: profile.id,
        email: null, // Email requires server-side admin API access
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        role: profile.role || 'standard',
        is_admin: profile.is_admin || false,
        subscription_status: profile.subscription_status || 'inactive',
        plan: profile.plan || 'free',
        plan_period: profile.plan_period || null,
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

  function handleRoleChange(userId: string, newAssignable: AdminAssignable) {
    setPendingRoleChanges(prev => {
      const next = new Map(prev);
      next.set(userId, newAssignable);
      return next;
    });
    setError(null);
  }

  async function saveUserRole(userId: string) {
    const next = pendingRoleChanges.get(userId);
    if (!next) return;

    setUpdatingUserId(userId);
    setError(null);

    try {
      // Маппинг назначения админа на колонки profiles:
      //  - admin            → is_admin=true (план не трогаем — админ обходит квоты в trigger).
      //  - free             → plan='free', is_admin=false, subscription_status='inactive'.
      //  - premium_viewer   → plan='premium_viewer', period='lifetime' (наш Premium one-time).
      //  - creator_*        → plan='creator_*',     period='month' (manually granted creator).
      //                       Реальная подписка не создаётся — Stripe этим юзером не управляет.
      //                       Это ручное предоставление прав; webhook'и от Stripe потом могут
      //                       перетереть, если юзер сам что-то купит.
      const updates: Record<string, unknown> = {};

      if (next === "admin") {
        updates.is_admin = true;
        updates.role = "admin";
      } else {
        updates.is_admin = false;
        updates.plan = next;
        if (next === "free") {
          updates.plan_period = null;
          updates.plan_renews_at = null;
          updates.subscription_status = "inactive";
          updates.role = "standard";
        } else if (next === "premium_viewer") {
          updates.plan_period = "lifetime";
          updates.plan_renews_at = null;
          updates.subscription_status = "active";
          updates.role = "premium";
        } else {
          // creator_service / creator_experience / creator_all — manual grant
          updates.plan_period = "month";
          updates.subscription_status = "active";
          updates.role = "premium";
        }
      }

      const { data, error } = await supabase
        .from("profiles")
        // @ts-expect-error Supabase generated types infer update payload as never
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

  function openDeleteConfirm(userId: string) {
    if (userId === currentUserId) {
      setError("You cannot delete your own account");
      return;
    }
    setError(null);
    setDeleteConfirmUserId(userId);
  }

  async function handleImpersonate(user: User) {
    if (user.id === currentUserId) {
      setError("Нельзя зайти под собой");
      return;
    }
    if (user.is_admin) {
      setError("Нельзя зайти под другим админом");
      return;
    }

    const targetLabel = user.display_name || user.username || user.email || "этим пользователем";
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Войти как ${targetLabel}?\n\nВсе ваши действия будут залогированы. Stripe-операции под чужим аккаунтом заблокированы. Вернуться обратно можно через баннер в шапке.`
      );
      if (!ok) return;
    }

    setImpersonatingUserId(user.id);
    setError(null);

    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();

      if (sessionErr || !session) {
        setError("Не удалось получить текущую сессию админа");
        return;
      }

      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: user.id,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(`Не удалось войти: ${body?.error ?? `HTTP ${res.status}`}`);
        return;
      }

      const tokenHash: string | undefined = body?.tokenHash;
      if (!tokenHash) {
        setError("Сервер не вернул token_hash");
        return;
      }

      const { error: otpErr } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });

      if (otpErr) {
        setError(`verifyOtp: ${otpErr.message}`);
        return;
      }

      // Полная перезагрузка — чтобы все провайдеры (UserAccessContext и др.) подхватили нового юзера.
      window.location.href = "/";
    } catch (err) {
      console.error("Error impersonating user:", err);
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setImpersonatingUserId(null);
    }
  }

  function closeDeleteConfirm() {
    setDeleteConfirmUserId(null);
  }

  async function confirmDeleteUser(userId: string) {
    setDeletingUserId(userId);
    setError(null);
    setDeleteConfirmUserId(null);

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) {
        console.error("Error deleting user profile:", profileError);
        setError("Failed to delete user. Note: Full user deletion requires server-side API.");
        return;
      }
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
        <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Users</h1>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="relative h-12 w-12 rounded-full overflow-hidden">
                  <SkeletonBase className="h-full w-full rounded-full" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="relative h-4 w-32 rounded overflow-hidden">
                    <SkeletonBase className="h-full w-full" />
                  </div>
                  <div className="relative h-3 w-24 rounded overflow-hidden">
                    <SkeletonBase className="h-full w-full" />
                  </div>
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
      <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Users</h1>
      
      {error && (
        <div className="mb-4 p-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 text-[#C96A5B] text-sm">
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
                    {(() => {
                      const cur = currentAdminAssignable(user);
                      if (cur === "admin") {
                        return (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#8F9E4F] text-white">
                            Admin
                          </span>
                        );
                      }
                      if (cur === "free") return null;
                      const label =
                        cur === "premium_viewer"     ? "Premium" :
                        cur === "creator_service"    ? "Pro Service" :
                        cur === "creator_experience" ? "Pro Experience" :
                        cur === "creator_all"        ? "Pro All-in" : null;
                      return label ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#D6B25E] text-white">
                          {label}
                        </span>
                      ) : null;
                    })()}
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
                  {/* Plan / Admin Selector */}
                  <select
                    value={pendingRoleChanges.get(user.id) || currentAdminAssignable(user)}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as AdminAssignable)}
                    disabled={updatingUserId === user.id || user.id === currentUserId}
                    className="px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ADMIN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
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

                  {/* Manage Auth Button (edit email/password, send reset/magic link) */}
                  {user.id !== currentUserId && !user.is_admin && !pendingRoleChanges.has(user.id) && (
                    <button
                      onClick={() => openManageModal(user)}
                      className="p-2 rounded-lg border border-[#ECEEE4] text-[#6F7A5A] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition"
                      title="Управление учётными данными"
                      aria-label="Manage user credentials"
                    >
                      <Icon name="lock" size={16} />
                    </button>
                  )}

                  {/* Impersonate Button */}
                  {user.id !== currentUserId && !user.is_admin && !pendingRoleChanges.has(user.id) && (
                    <button
                      onClick={() => handleImpersonate(user)}
                      disabled={impersonatingUserId === user.id}
                      className="p-2 rounded-lg border border-[#ECEEE4] text-[#6F7A5A] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Войти как этот пользователь"
                      aria-label="Войти как этот пользователь"
                    >
                      {impersonatingUserId === user.id ? (
                        <div className="w-4 h-4 border-2 border-[#8F9E4F] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="eye" size={16} />
                      )}
                    </button>
                  )}

                  {/* Delete Button */}
                  {user.id !== currentUserId && !pendingRoleChanges.has(user.id) && (
                    <button
                      onClick={() => openDeleteConfirm(user.id)}
                      disabled={deletingUserId === user.id}
                      className="p-2 rounded-lg border border-[#C96A5B]/30 text-[#C96A5B] hover:bg-[#C96A5B]/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete user"
                    >
                      {deletingUserId === user.id ? (
                        <div className="w-4 h-4 border-2 border-[#C96A5B] border-t-transparent rounded-full animate-spin" />
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

      {/* Delete user confirmation modal */}
      {deleteConfirmUserId != null && (() => {
        const userToDelete = users.find((u) => u.id === deleteConfirmUserId);
        const displayName = userToDelete
          ? userToDelete.display_name || userToDelete.username || userToDelete.email || "User"
          : "this user";
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-modal-title"
          >
            <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6">
              <h2 id="delete-user-modal-title" className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
                Delete user
              </h2>
              <p className="text-sm text-[#6F7A5A] mb-6">
                Are you sure you want to delete <strong className="text-[#1F2A1F]">{displayName}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeDeleteConfirm}
                  className="px-4 py-2.5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteUser(deleteConfirmUserId)}
                  className="px-4 py-2.5 rounded-xl bg-[#C96A5B] text-white text-sm font-medium hover:bg-[#B85A4B] transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manage user credentials modal */}
      {manageUserId != null && (() => {
        const target = users.find((u) => u.id === manageUserId);
        const displayName = target
          ? target.display_name || target.username || target.email || "User"
          : "User";
        const targetEmail = target?.email || "";
        const busy = manageBusyAction !== null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-user-modal-title"
          >
            <div className="w-full max-w-lg rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-2">
                <h2
                  id="manage-user-modal-title"
                  className="font-fraunces text-xl font-semibold text-[#1F2A1F]"
                >
                  Manage credentials
                </h2>
                <button
                  type="button"
                  onClick={closeManageModal}
                  className="p-1 rounded-lg text-[#6F7A5A] hover:bg-[#FAFAF7] transition"
                  aria-label="Close"
                  disabled={busy}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <p className="text-sm text-[#6F7A5A] mb-4">
                <strong className="text-[#1F2A1F]">{displayName}</strong>
                {targetEmail ? <span className="text-[#A8B096]"> · {targetEmail}</span> : null}
              </p>

              {manageError && (
                <div className="mb-3 p-3 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 text-[#C96A5B] text-sm">
                  {manageError}
                </div>
              )}
              {manageSuccess && (
                <div className="mb-3 p-3 rounded-xl border border-[#8F9E4F]/30 bg-[#8F9E4F]/10 text-[#556036] text-sm">
                  {manageSuccess}
                </div>
              )}

              {/* Section: Email */}
              <div className="mb-5 pb-5 border-b border-[#ECEEE4]">
                <label className="block text-xs uppercase tracking-wide text-[#6F7A5A] mb-2">
                  Email
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={manageEmail}
                    onChange={(e) => setManageEmail(e.target.value)}
                    disabled={busy}
                    placeholder="user@example.com"
                    className="flex-1 px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={manageSetEmail}
                    disabled={busy || !manageEmail.trim() || manageEmail.trim() === targetEmail}
                    className="px-4 py-2 rounded-lg bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {manageBusyAction === "email" ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>...</span>
                      </>
                    ) : (
                      <span>Save email</span>
                    )}
                  </button>
                </div>
                <p className="text-xs text-[#A8B096] mt-2">
                  Меняется сразу, без подтверждения по почте.
                </p>
              </div>

              {/* Section: Password */}
              <div className="mb-5 pb-5 border-b border-[#ECEEE4]">
                <label className="block text-xs uppercase tracking-wide text-[#6F7A5A] mb-2">
                  Set new password
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={managePassword}
                    onChange={(e) => setManagePassword(e.target.value)}
                    disabled={busy}
                    placeholder="min 8 characters"
                    autoComplete="new-password"
                    className="flex-1 px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] disabled:opacity-50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={manageSetPassword}
                    disabled={busy || managePassword.length < 8}
                    className="px-4 py-2 rounded-lg bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {manageBusyAction === "password" ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>...</span>
                      </>
                    ) : (
                      <span>Set password</span>
                    )}
                  </button>
                </div>
                <p className="text-xs text-[#A8B096] mt-2">
                  Применяется сразу. Сообщите пользователю новый пароль безопасным каналом.
                </p>
              </div>

              {/* Section: Email-based flows */}
              <div className="mb-2">
                <label className="block text-xs uppercase tracking-wide text-[#6F7A5A] mb-2">
                  Email user a link
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={manageSendResetLink}
                    disabled={busy}
                    className="flex-1 px-4 py-2 rounded-lg border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    {manageBusyAction === "reset" ? (
                      <>
                        <div className="w-3 h-3 border-2 border-[#8F9E4F] border-t-transparent rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="lock" size={14} />
                        <span>Send password reset</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={manageSendMagicLink}
                    disabled={busy}
                    className="flex-1 px-4 py-2 rounded-lg border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    {manageBusyAction === "magic" ? (
                      <>
                        <div className="w-3 h-3 border-2 border-[#8F9E4F] border-t-transparent rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="mail" size={14} />
                        <span>Send magic link</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-[#A8B096] mt-2">
                  Письмо уйдёт через Supabase Auth (шаблоны Reset / Magic).
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={closeManageModal}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ActivityCard({ item, userAvatar, userName }: { item: ActivityItem; userAvatar: string | null; userName: string }) {
  const isDesktop = useIsDesktop();
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
      target={isDesktop ? "_blank" : undefined}
      rel={isDesktop ? "noopener noreferrer" : undefined}
      className="block w-full py-4 lg:py-5 px-6 hover:bg-[#FAFAF7] transition-colors border-b border-[#ECEEE4] last:border-b-0"
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
              <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-lg bg-[#FAFAF7] overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverUrl}
                  alt={item.placeTitle ?? "Place"}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-lg bg-[#FAFAF7] flex items-center justify-center flex-shrink-0">
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

// ─────────────────────────────────────────────────────────────────────────────
// PremiumSection — статус подписки + апгрейд + cancel через Stripe
// Источник правды по тарифам — app/lib/plans.ts.
// ─────────────────────────────────────────────────────────────────────────────

function PremiumSection() {
  const router = useRouter();
  const { user, profile, access } = useUserAccessContext();
  const impersonation = useImpersonationStatus();
  const isImpersonating = !!impersonation?.active;
  const [opening, setOpening] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = access?.plan ?? "free";
  const isPaid = currentPlan !== "free";

  async function startCheckout(planId: string) {
    setError(null);
    if (isImpersonating) {
      setError("Stripe-операции отключены в режиме impersonation.");
      return;
    }
    if (!user) {
      router.push(getAuthUrl("/profile?section=premium"));
      return;
    }
    if (currentPlan === planId) {
      setError("You already have this plan.");
      return;
    }
    setCheckoutPlan(planId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        router.push(getAuthUrl("/profile?section=premium"));
        return;
      }
      const cfg = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
      const body: Record<string, string> = { access_token: token, plan: planId };
      if (cfg.billing.kind === "subscription") body.period = cfg.billing.period;
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Couldn't start checkout");
        setCheckoutPlan(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setCheckoutPlan(null);
    }
  }

  async function openPortal() {
    setError(null);
    if (isImpersonating) {
      setError("Stripe-операции отключены в режиме impersonation.");
      return;
    }
    setOpening(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        router.push(getAuthUrl("/profile?section=premium"));
        return;
      }
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Couldn't open billing portal");
        setOpening(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open billing portal");
      setOpening(false);
    }
  }

  const currentCfg = isPaid ? PLAN_CONFIG[currentPlan as keyof typeof PLAN_CONFIG] : null;
  const isLifetime = profile?.plan_period === "lifetime";

  return (
    <div className="space-y-6">
      <h1 className="hidden lg:block text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-8">Premium</h1>

      <ImpersonationDisclaimer />

      {/* Current plan */}
      <section className="rounded-2xl border border-[#ECEEE4] bg-white p-5 sm:p-6">
        <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-2">Current plan</div>
        {currentCfg ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl" aria-hidden>{currentCfg.display.emoji}</div>
              <div>
                <div className="font-fraunces text-xl font-semibold text-[#1F2A1F]">{currentCfg.display.name}</div>
                <div className="text-sm text-[#6F7A5A]">{currentCfg.display.tagline}</div>
              </div>
              <span className="ml-auto rounded-full bg-[#8F9E4F]/15 text-[#556036] text-[11px] font-semibold uppercase tracking-wide px-2 py-1">
                Active
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <div className="text-xs text-[#A8B096] mb-1">Billing</div>
                <div className="text-[#1F2A1F]">
                  {profile?.plan_period === "year" ? "Annual"
                   : profile?.plan_period === "month" ? "Monthly"
                   : profile?.plan_period === "lifetime" ? "Lifetime (one-time)"
                   : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#A8B096] mb-1">Next charge</div>
                <div className="text-[#1F2A1F]">
                  {isLifetime ? "Never (one-time)"
                   : profile?.plan_renews_at ? new Date(profile.plan_renews_at).toLocaleDateString("en-US")
                   : "—"}
                </div>
              </div>
            </div>
            {!isLifetime && (
              <button
                type="button"
                onClick={openPortal}
                disabled={opening || isImpersonating}
                title={isImpersonating ? "Stripe-операции отключены в режиме impersonation" : undefined}
                className={cx(
                  "h-11 px-5 rounded-xl text-sm font-medium transition",
                  isImpersonating
                    ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                    : "bg-[#8F9E4F] text-white hover:bg-[#556036]",
                  opening && "opacity-70 cursor-wait"
                )}
              >
                {isImpersonating ? "Locked" : opening ? "Opening Stripe…" : "Manage / cancel"}
              </button>
            )}
          </>
        ) : (
          <div className="text-sm text-[#3F4A35]">
            You&apos;re on the free plan. Pick a plan below to unlock hidden locations or start publishing services and experiences.
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-3 text-sm text-[#C96A5B]">{error}</div>
        )}
      </section>

      {/* Available plans */}
      <section>
        <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-3">
          {isPaid ? "Switch plan" : "Plans"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLAN_ORDER.map((id) => {
            const cfg = PLAN_CONFIG[id];
            const isCurrent = currentPlan === id;
            const isLoading = checkoutPlan === id;
            return (
              <div
                key={id}
                className={cx(
                  "rounded-2xl border bg-white p-4 flex flex-col",
                  cfg.display.highlighted ? "border-[#8F9E4F]" : "border-[#ECEEE4]"
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-2xl" aria-hidden>{cfg.display.emoji}</div>
                  <div className="flex-1">
                    <div className="font-fraunces text-lg font-semibold text-[#1F2A1F]">{cfg.display.name}</div>
                    <div className="text-xs text-[#6F7A5A]">{cfg.display.tagline}</div>
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="font-fraunces text-2xl font-semibold text-[#1F2A1F]">{formatPrice(cfg.display.price)}</span>
                  <span className="text-sm text-[#6F7A5A]">{cfg.display.priceSuffix}</span>
                </div>
                <ul className="space-y-1 text-xs text-[#3F4A35] mb-4 flex-1">
                  {cfg.display.features.filter((f) => f.included).slice(0, 3).map((f) => (
                    <li key={f.label} className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[#8F9E4F]">✓</span>
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => startCheckout(id)}
                  disabled={isCurrent || isLoading || isImpersonating}
                  title={isImpersonating ? "Покупки отключены в режиме impersonation" : undefined}
                  className={cx(
                    "w-full h-10 rounded-xl text-sm font-medium transition",
                    isCurrent || isImpersonating
                      ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                      : cfg.display.highlighted
                      ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                      : "border border-[#8F9E4F] bg-white text-[#556036] hover:bg-[#FAFAF7]",
                    isLoading && "opacity-70 cursor-wait"
                  )}
                >
                  {isCurrent ? "Current" : isImpersonating ? "Locked" : isLoading ? "Loading…" : cfg.billing.kind === "one_time" ? "Buy" : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Add-on */}
      <section className="rounded-2xl border border-[#ECEEE4] bg-white p-5">
        <div className="font-fraunces font-semibold text-[#1F2A1F] mb-1">+1 slot: {formatPrice(EXTRA_LISTING.price)}</div>
        <p className="text-sm text-[#6F7A5A]">
          One extra listing over your plan&apos;s limit. Purchased right from the editor when you hit the cap.
        </p>
      </section>

      <p className="text-xs text-[#A8B096] text-center">
        All payments are processed by Stripe. Prices exclude taxes; Maporia is a directory — we don&apos;t process payments between buyers and providers.
      </p>
    </div>
  );
}
