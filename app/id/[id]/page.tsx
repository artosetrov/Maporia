"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES, DEFAULT_CITY } from "../../constants";
import TopBar from "../../components/TopBar";
import BottomNav from "../../components/BottomNav";
import DesktopMosaic from "../../components/DesktopMosaic";
import MobileCarousel from "../../components/MobileCarousel";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../../config/googleMaps";
import { supabase } from "../../lib/supabase";
import { PLACE_LAYOUT_CONFIG } from "../../config/placeLayout";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  link: string | null;
  tags: string[] | null;
  categories: string[] | null;
  cover_url: string | null;
  photo_urls: string[] | null;
  created_by: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

type Comment = { 
  id: string; 
  text: string; 
  created_at: string; 
  user_id: string;
  user_display_name?: string | null;
  user_username?: string | null;
  user_avatar_url?: string | null;
};

type CreatorProfile = { 
  display_name: string | null; 
  username: string | null; 
  avatar_url: string | null;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
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
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function initialsFromName(displayName?: string | null, username?: string | null): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    }
    return displayName[0]?.toUpperCase() || "U";
  }
  if (username) {
    return username[0]?.toUpperCase() || "U";
  }
  return "U";
}

export default function PlacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [activeSection, setActiveSection] = useState<"overview" | "photos" | "details" | "map" | "comments">("overview");
  const [stickyNavVisible, setStickyNavVisible] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState<number>(0);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);

  // Close modal on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showDescriptionModal) {
        setShowDescriptionModal(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showDescriptionModal]);

  // Refs for smooth scrolling
  const overviewRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => place?.tags ?? [], [place]);
  const categories = useMemo(() => place?.categories ?? [], [place]);
  const isOwner = place?.created_by === userId;

  // Get photos from place_photos table
  const [loadedPhotos, setLoadedPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!id || !place) return;

    (async () => {
      const { data: photosData, error } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", id)
        .order("sort", { ascending: true });

      if (!error && photosData && photosData.length > 0) {
        const urls = photosData.map((p: any) => p.url).filter(Boolean);
        setLoadedPhotos(urls);
      } else {
        // Fallback: use legacy format
        const photos: string[] = [];
        if (place.photo_urls && Array.isArray(place.photo_urls) && place.photo_urls.length > 0) {
          photos.push(...place.photo_urls.filter((url): url is string => typeof url === "string" && url.length > 0));
        } else if (place.cover_url) {
          photos.push(place.cover_url);
        }
        setLoadedPhotos(photos);
      }
    })();
  }, [id, place?.id]);

  const allPhotos = useMemo(() => {
    if (loadedPhotos.length > 0) {
      return loadedPhotos;
    }
    if (!place) return [];
    const photos: string[] = [];
    if (place.photo_urls && Array.isArray(place.photo_urls) && place.photo_urls.length > 0) {
      photos.push(...place.photo_urls.filter((url): url is string => typeof url === "string" && url.length > 0));
    } else if (place.cover_url) {
      photos.push(place.cover_url);
    }
    return photos;
  }, [loadedPhotos, place?.photo_urls, place?.cover_url]);

  // Sticky nav visibility on scroll
  useEffect(() => {
    const checkVisibility = () => {
      if (heroRef.current) {
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        setStickyNavVisible(heroBottom <= 0);
      } else {
        setStickyNavVisible(false);
      }
    };

    // Check initial state
    checkVisibility();

    // Check on scroll
    const handleScroll = () => {
      checkVisibility();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [place]); // Re-check when place data loads

  // Active section detection on scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 100;
      
      if (commentsRef.current && scrollPos >= commentsRef.current.offsetTop - 200) {
        setActiveSection("comments");
      } else if (mapRef.current && scrollPos >= mapRef.current.offsetTop - 200) {
        setActiveSection("map");
      } else if (detailsRef.current && scrollPos >= detailsRef.current.offsetTop - 200) {
        setActiveSection("details");
      } else if (photosRef.current && scrollPos >= photosRef.current.offsetTop - 200) {
        setActiveSection("photos");
      } else {
        setActiveSection("overview");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [place]);

  // Smooth scroll to section
  const scrollToSection = (section: "overview" | "photos" | "details" | "map" | "comments") => {
    setActiveSection(section);
    const refs = {
      overview: overviewRef,
      photos: photosRef,
      details: detailsRef,
      map: mapRef,
      comments: commentsRef,
    };
    const ref = refs[section];
    if (ref.current) {
      const offset = stickyNavVisible ? 120 : 80; // Account for sticky nav (single row)
      const elementPosition = ref.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        setUserEmail(data.user.email ?? null);

        // Загружаем профиль пользователя
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error loading user profile:", profileError);
        }

        if (profile) {
          setUserDisplayName(profile.display_name);
          setUserAvatar(profile.avatar_url);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!id) return;

    (async () => {
      const { data: placeData, error: pErr } = await supabase
        .from("places")
        .select("*")
        .eq("id", id)
        .single();

      if (pErr || !placeData) {
        router.push("/");
        return;
      }
      const placeItem = placeData as Place;
      setPlace(placeItem);

      // Load creator profile
      if (placeItem.created_by) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", placeItem.created_by)
          .maybeSingle();

        if (profileError) {
          console.error("Error loading creator profile:", profileError);
        }

        setCreatorProfile({
          display_name: profileData?.display_name ?? null,
          username: profileData?.username ?? null,
          avatar_url: profileData?.avatar_url ?? null,
        });
      }

      // Load comments
      setCommentsLoading(true);
      const { data: commentData, error: commentErr } = await supabase
        .from("comments")
        .select("id,text,created_at,user_id")
        .eq("place_id", id)
        .order("created_at", { ascending: false });
      
      // Count favorites (reactions with "like")
      const { count: favoritesCountData } = await supabase
        .from("reactions")
        .select("*", { count: 'exact', head: true })
        .eq("place_id", id)
        .eq("reaction", "like");
      
      // Count comments
      const { count: commentsCountData } = await supabase
        .from("comments")
        .select("*", { count: 'exact', head: true })
        .eq("place_id", id);
      
      setFavoritesCount(favoritesCountData || 0);
      setCommentsCount(commentsCountData || 0);

      if (commentErr) {
        console.error("Error loading comments:", commentErr);
        if (comments.length === 0) {
          setCommentError("Failed to load comments. Please refresh the page.");
        }
      } else {
        const userIds = Array.from(new Set((commentData ?? []).map((c: any) => c.user_id)));
        const profilesMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();

        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", userIds);

          (profilesData ?? []).forEach((p: any) => {
            profilesMap.set(p.id, {
              display_name: p.display_name,
              username: p.username,
              avatar_url: p.avatar_url,
            });
          });
        }

        const commentsWithProfiles: Comment[] = (commentData ?? []).map((c: any) => {
          const profile = profilesMap.get(c.user_id);
          return {
            ...c,
            user_display_name: profile?.display_name ?? null,
            user_username: profile?.username ?? null,
            user_avatar_url: profile?.avatar_url ?? null,
          };
        });

        setComments(commentsWithProfiles);
        setCommentsCount(commentsWithProfiles.length);
        setCommentError(null);
      }
      setCommentsLoading(false);
    })();
  }, [id, router]);

  // Check if place is favorited
  useEffect(() => {
    if (!id || !userId) {
      setIsFavorite(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("reactions")
          .select("place_id")
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like")
          .maybeSingle();

        if (error) {
          console.error("Error checking favorite status:", error);
          return;
        }

        setIsFavorite(!!data);
      } catch (err) {
        console.error("Exception checking favorite status:", err);
      }
    })();
  }, [id, userId]);

  async function toggleFavorite() {
    if (!userId || !id) {
      router.push("/auth");
      return;
    }

    setFavoriteLoading(true);
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error removing favorite:", error);
        } else {
          setIsFavorite(false);
          setFavoritesCount((prev) => Math.max(0, prev - 1));
        }
      } else {
        const { data: existingData } = await supabase
          .from("reactions")
          .select("id")
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like")
          .maybeSingle();

        if (existingData) {
          setIsFavorite(true);
        } else {
          const { error } = await supabase
            .from("reactions")
            .insert({
              place_id: id,
              user_id: userId,
              reaction: "like",
            });

          if (error) {
            console.error("Error adding favorite:", error);
          } else {
            setIsFavorite(true);
            setFavoritesCount((prev) => prev + 1);
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function handleShare() {
    if (!place || !id) return;

    const shareUrl = `${window.location.origin}/id/${id}`;
    const shareData = {
      title: place.title,
      text: place.description || place.title,
      url: shareUrl,
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback: копируем в буфер обмена
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard!");
      }
    } catch (err) {
      // Пользователь отменил или произошла ошибка
      if ((err as Error).name !== "AbortError") {
        // Fallback: копируем в буфер обмена
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert("Link copied to clipboard!");
        } catch (clipboardErr) {
          console.error("Failed to copy:", clipboardErr);
        }
      }
    }
  }

  async function addComment() {
    if (!place || !commentText.trim() || sending) return;

    setSending(true);
    setCommentError(null);
    
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      
      if (authError || !auth.user) {
        setSending(false);
        setCommentError("You need to sign in to post comments.");
        setTimeout(() => {
          router.push("/auth");
        }, 2000);
        return;
      }

      const user = auth.user;
      
      if (!user || !user.id) {
        setSending(false);
        setCommentError("User ID is missing. Please sign in again.");
        setTimeout(() => {
          router.push("/auth");
        }, 2000);
        return;
      }

      const trimmedText = commentText.trim();

      if (!trimmedText) {
        setSending(false);
        return;
      }

      const { data, error } = await supabase
        .from("comments")
        .insert({
          place_id: place.id,
          user_id: user.id,
          text: trimmedText,
        })
        .select("id,text,created_at,user_id")
        .single();

      setSending(false);
      
      if (error) {
        console.error("Error adding comment:", error);
        setCommentError(error.message || "Failed to post comment. Please try again.");
        return;
      }
      
      if (data) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", user.id)
          .single();

        const newComment: Comment = {
          ...data,
          user_display_name: profileData?.display_name ?? null,
          user_username: profileData?.username ?? null,
          user_avatar_url: profileData?.avatar_url ?? null,
        };

        setComments((prev) => [newComment, ...prev]);
        setCommentsCount((prev) => prev + 1);
        setCommentText("");
        setCommentError(null);
      }
    } catch (err) {
      console.error("Unexpected error adding comment:", err);
      setSending(false);
      setCommentError("An unexpected error occurred. Please try again.");
    }
  }

  async function deleteComment(commentId: string) {
    if (!userId) return;

    setDeletingCommentId(commentId);

    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", userId);

      if (error) {
        console.error("Error deleting comment:", error);
        setCommentError("Failed to delete comment. Please try again.");
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setCommentsCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Unexpected error deleting comment:", err);
      setCommentError("An unexpected error occurred while deleting.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  const creatorName = creatorProfile?.display_name || creatorProfile?.username || "User";

  if (!place) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm text-[#6b7d47]/60">Loading…</div>
      </main>
    );
  }

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
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
      />

      {/* Combined Sticky Bar - All in one row */}
      <div
        className={cx(
          "fixed top-[64px] left-0 right-0 z-30 bg-white border-b border-[#6b7d47]/10 transition-all duration-200",
          stickyNavVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
        <div className="px-4 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            {/* Left: Back button */}
            <button
              onClick={() => router.back()}
              className="h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center text-[#2d2d2d] transition flex-shrink-0"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Center: Navigation tabs */}
            {/* Desktop: Full-width tabs */}
            <div className="hidden lg:flex items-center gap-1 flex-1">
              {(["overview", "photos", "details", "map", "comments"] as const).map((section) => (
                <button
                  key={section}
                  onClick={() => scrollToSection(section)}
                  className={cx(
                    "px-4 py-2 text-sm font-medium transition border-b-2",
                    activeSection === section
                      ? "text-[#6b7d47] border-[#6b7d47]"
                      : "text-[#6b7d47]/60 border-transparent hover:text-[#6b7d47]"
                  )}
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </div>

            {/* Mobile: Horizontally scrollable tabs */}
            <div className="lg:hidden overflow-x-auto scrollbar-hide flex-1 -mx-4 px-4">
              <div className="flex items-center gap-1 min-w-max">
                {(["overview", "photos", "details", "map", "comments"] as const).map((section) => (
                  <button
                    key={section}
                    onClick={() => scrollToSection(section)}
                    className={cx(
                      "px-4 py-2 text-sm font-medium transition whitespace-nowrap border-b-2",
                      activeSection === section
                        ? "text-[#6b7d47] border-[#6b7d47]"
                        : "text-[#6b7d47]/60 border-transparent"
                    )}
                  >
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Favorite button */}
              {userId && (
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center transition flex-shrink-0",
                    isFavorite ? "text-[#6b7d47]" : "text-[#6b7d47]/60",
                    favoriteLoading && "opacity-50"
                  )}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className="w-5 h-5"
                    fill={isFavorite ? "currentColor" : "none"}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                </button>
              )}
              
              {/* Edit button (only for owner) */}
              {isOwner && (
                <button
                  onClick={() => router.push(`/id/${id}/edit`)}
                  className="h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center text-[#2d2d2d] transition flex-shrink-0"
                  aria-label="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              
              {/* Share button */}
              <button
                onClick={handleShare}
                className="h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center text-[#2d2d2d] transition flex-shrink-0"
                aria-label="Share"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Title Row - Desktop (>= 1120px): Before gallery */}
      <div className="hidden min-[1120px]:block pt-[80px]">
        <div className="max-w-[1280px] min-[1120px]:max-w-[1120px] min-[1440px]:max-w-[1280px] mx-auto px-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold text-[#2d2d2d] flex-1 min-w-0">{place.title}</h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleShare}
                className="h-10 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm font-medium text-[#2d2d2d]"
                aria-label="Share"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
              {userId ? (
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "h-10 px-4 rounded-full border transition flex items-center justify-center gap-2 text-sm font-medium",
                    isFavorite
                      ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] hover:bg-[#6b7d47]/20"
                      : "border-gray-200 bg-white text-[#2d2d2d] hover:bg-gray-50",
                    favoriteLoading && "opacity-50"
                  )}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  Save
                </button>
              ) : (
                <button
                  onClick={() => router.push("/auth")}
                  className="h-10 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm font-medium text-[#2d2d2d]"
                  aria-label="Add to favorites"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Photo Gallery - Responsive */}
      {/* Desktop: Airbnb-style mosaic gallery (>= 900px) - 2:1 aspect ratio */}
      <div ref={heroRef} className="hidden min-[900px]:block mb-6">
        <div className="max-w-[1280px] min-[1120px]:max-w-[1120px] min-[1440px]:max-w-[1280px] mx-auto px-6 min-[1120px]:px-6 min-[1440px]:px-6">
          <DesktopMosaic
            photos={allPhotos}
            title={place.title}
            gap={PLACE_LAYOUT_CONFIG.desktopXL.galleryGap}
            radius={PLACE_LAYOUT_CONFIG.desktopXL.galleryRadius}
            onShowAll={() => scrollToSection("photos")}
          />
        </div>
      </div>

      {/* Mobile: Full-bleed carousel (< 900px) */}
      <div className="min-[900px]:hidden relative">
        <MobileCarousel
          photos={allPhotos}
          title={place.title}
          height={PLACE_LAYOUT_CONFIG.mobile.galleryHeight}
          onShowAll={() => scrollToSection("photos")}
        />
        
        {/* Mobile App Bar - Back, Share, Heart */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {userId && (
              <button
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                className={cx(
                  "h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center transition shadow-sm",
                  isFavorite ? "text-[#6b7d47]" : "text-[#6b7d47]/60",
                  favoriteLoading && "opacity-50"
                )}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <svg
                  className="w-5 h-5"
                  fill={isFavorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={handleShare}
              className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm"
              aria-label="Share"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          </div>
        </div>
      </div>


      {/* Mobile/Tablet: Bottom sheet with title (mobile only) */}
      <div className="min-[900px]:hidden">
        <div className="bg-white rounded-t-[24px] -mt-8 relative z-10 px-4 pt-6 pb-4">
          <h1 className="text-2xl font-semibold text-[#2d2d2d] mb-2 line-clamp-2">{place.title}</h1>
        </div>
      </div>

      {/* Tablet: Title section */}
      <div className="hidden min-[600px]:max-[899px]:block max-w-full mx-auto px-5 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-[#2d2d2d] mb-2">{place.title}</h1>
          </div>
        </div>
      </div>

      {/* Content Sections - Responsive Layout */}
      {/* Desktop: 2 columns (Content + Sticky Booking) >= 1120px */}
      <div className="hidden min-[1120px]:flex max-w-[1280px] min-[1120px]:max-w-[1120px] min-[1440px]:max-w-[1280px] mx-auto px-6 py-8 gap-8">
        {/* Left: Content (58-64%) */}
        <div className="w-[62%] min-[1440px]:w-[60%]">
        {/* City and Address */}
        <div className="mb-6">
          {place.city && (
            <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-2">{place.city}</h2>
          )}
          {place.address && (
            <div className="mb-4">
              {place.lat && place.lng ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-[#6b7d47]/70 hover:text-[#6b7d47] hover:underline transition"
                >
                  {place.address}
                </a>
              ) : (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-[#6b7d47]/70 hover:text-[#6b7d47] hover:underline transition"
                >
                  {place.address}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Statistics Block */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Favorites count */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#6b7d47]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[#6b7d47]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[#2d2d2d]">{favoritesCount}</div>
                <div className="text-sm text-gray-600">Added to favorites</div>
              </div>
            </div>

            {/* Right: Comments count */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#6b7d47]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[#6b7d47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[#2d2d2d]">{commentsCount}</div>
                <div className="text-sm text-gray-600">Comments</div>
              </div>
            </div>
          </div>
        </div>

        {/* Author Section */}
        {creatorProfile && (
          <div className="flex items-center gap-4 pb-6 mb-6 border-b border-gray-200">
            {creatorProfile.avatar_url ? (
              <img
                src={creatorProfile.avatar_url}
                alt={creatorName}
                className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#6b7d47]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-semibold text-[#6b7d47]">
                  {initialsFromName(creatorProfile.display_name, creatorProfile.username)}
                </span>
              </div>
            )}
            <div>
              <div className="text-base font-semibold text-[#2d2d2d]">Added by {creatorName}</div>
              <div className="text-sm text-[#6b7d47]/60">{timeAgo(place.created_at)}</div>
            </div>
          </div>
        )}

        {/* Overview Section */}
        <section ref={overviewRef} id="overview" className="mb-16">
          {place.description && (
            <div className="mb-6">
              {place.description.length > 300 ? (
                <>
                  <p className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                    {place.description.substring(0, 300)}...
                  </p>
                  <button
                    onClick={() => setShowDescriptionModal(true)}
                    className="mt-4 w-full py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition text-base font-medium text-[#2d2d2d]"
                  >
                    Show more
                  </button>
                </>
              ) : (
                <p className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                  {place.description}
                </p>
              )}
            </div>
          )}

          {/* Highlights */}
          {tags.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-[#2d2d2d] mb-3">Highlights</h3>
              <div className="flex flex-wrap gap-2">
                {tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full text-sm text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Photos Section */}
        <section ref={photosRef} id="photos" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Photos</h2>
          {allPhotos.length === 0 ? (
            <div className="text-center py-12 text-[#6b7d47]/60">No photos available</div>
          ) : (
            <>
              <div className={cx(
                "grid gap-2",
                photosExpanded || allPhotos.length <= 4
                  ? "grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-2 lg:grid-cols-4"
              )}>
                {(photosExpanded ? allPhotos : allPhotos.slice(0, 4)).map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentPhotoIndex(index);
                      setPhotosExpanded(true);
                    }}
                    className="aspect-square rounded-xl overflow-hidden bg-[#f5f4f2] group"
                  >
                    <img
                      src={photo}
                      alt={`${place.title} - Photo ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </button>
                ))}
              </div>
              {allPhotos.length > 4 && !photosExpanded && (
                <button
                  onClick={() => setPhotosExpanded(true)}
                  className="mt-4 w-full py-3 rounded-xl border border-[#6b7d47]/20 text-[#6b7d47] font-medium hover:bg-[#f5f4f2] transition"
                >
                  Show all {allPhotos.length} photos
                </button>
              )}
            </>
          )}
        </section>

        {/* Details Section */}
        <section ref={detailsRef} id="details" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Details</h2>
          
          <div className="space-y-6">
            {/* Address */}
            {place.address && (
              <div>
                <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Address</h3>
                <p className="text-sm text-[#6b7d47]/70">{place.address}</p>
              </div>
            )}

            {/* Tags/Vibes */}
            {tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Vibes</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full text-sm text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Added by */}
            <div>
              <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Added by</h3>
              <div className="flex items-center gap-3">
                {creatorProfile?.avatar_url ? (
                  <img
                    src={creatorProfile.avatar_url}
                    alt={creatorName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center">
                    <span className="text-sm font-semibold text-[#6b7d47]">
                      {initialsFromName(creatorProfile?.display_name, creatorProfile?.username)}
                    </span>
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-[#2d2d2d]">{creatorName}</div>
                  <div className="text-xs text-[#6b7d47]/60">{timeAgo(place.created_at)}</div>
                </div>
              </div>
            </div>

            {/* External Link */}
            {place.link && (
              <div>
                <a
                  href={place.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Visit Website
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Map Section */}
        <section ref={mapRef} id="map" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Location</h2>
          {place.lat && place.lng ? (
            <div className="space-y-4">
              <div className="h-[400px] lg:h-[500px] rounded-xl overflow-hidden bg-[#f5f4f2]">
                <PlaceMapView place={place} />
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#6b7d47] text-sm font-medium hover:bg-[#f5f4f2] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in Maps
              </a>
            </div>
          ) : (
            <div className="text-center py-12 text-[#6b7d47]/60">Location not available</div>
          )}
        </section>

        {/* Comments Section */}
        <section ref={commentsRef} id="comments" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Comments</h2>

          {/* Add comment */}
          {userId ? (
            <div className="mb-6 rounded-xl border border-[#6b7d47]/10 bg-white p-4">
              <textarea
                className="w-full bg-transparent text-sm outline-none text-[#2d2d2d] placeholder:text-[#6b7d47]/40 resize-none mb-3"
                placeholder="Share your thoughts..."
                rows={3}
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  setCommentError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (commentText.trim() && !sending) {
                      addComment();
                    }
                  }
                }}
              />
              {commentError && (
                <div className="mb-3 text-xs text-red-500">{commentError}</div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={addComment}
                  disabled={!commentText.trim() || sending}
                  className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] disabled:opacity-50 transition"
                >
                  {sending ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-[#6b7d47]/10 bg-white p-4 text-center">
              <div className="text-sm text-[#6b7d47]/60 mb-2">Sign in to post comments</div>
              <button
                onClick={() => router.push("/auth")}
                className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Comments list */}
          {commentsLoading ? (
            <div className="text-center py-12 text-[#6b7d47]/60">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-[#6b7d47]/60">
              <div className="mb-1">No comments yet</div>
              <div className="text-sm">Be the first to share your thoughts</div>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => {
                const isMyComment = userId && c.user_id === userId;
                const userName = c.user_display_name || c.user_username || "User";
                const userAvatar = c.user_avatar_url;
                const userInitials = initialsFromName(c.user_display_name, c.user_username);
                
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-[#6b7d47]/10 bg-white p-4"
                  >
                    <div className="flex items-start gap-3">
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt={userName}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-[#6b7d47]">
                            {userInitials}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[#2d2d2d]">
                              {userName}
                            </div>
                            <div className="text-xs text-[#6b7d47]/60">
                              {timeAgo(c.created_at)}
                            </div>
                          </div>
                          {isMyComment && (
                            <button
                              onClick={() => {
                                if (confirm("Delete this comment?")) {
                                  deleteComment(c.id);
                                }
                              }}
                              disabled={deletingCommentId === c.id}
                              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition flex-shrink-0"
                            >
                              {deletingCommentId === c.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-[#2d2d2d] leading-relaxed">
                          {c.text}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </div>

        {/* Right: Sticky Actions Card (38-42%) */}
        <div className="w-[38%] min-[1440px]:w-[40%] flex-shrink-0">
          <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" style={{ maxWidth: PLACE_LAYOUT_CONFIG.desktopXL.bookingCardMaxWidth }}>
            <div className="space-y-4">
              {/* Write Comment */}
              <button
                onClick={() => scrollToSection("comments")}
                className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Write a comment
              </button>

              {/* Add to Favorites */}
              {userId ? (
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "w-full py-3 px-4 rounded-xl border transition flex items-center justify-center gap-2 font-medium",
                    isFavorite
                      ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] hover:bg-[#6b7d47]/20"
                      : "border-gray-200 bg-white text-[#2d2d2d] hover:bg-gray-50",
                    favoriteLoading && "opacity-50"
                  )}
                >
                  <svg
                    className="w-5 h-5"
                    fill={isFavorite ? "currentColor" : "none"}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                  {isFavorite ? "Remove from favorites" : "Add to favorites"}
                </button>
              ) : (
                <button
                  onClick={() => router.push("/auth")}
                  className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Add to favorites
                </button>
              )}

              {/* Show on Map (Google Link) */}
              {place.lat && place.lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Show on map
                </a>
              )}

              {/* Share */}
              <button
                onClick={handleShare}
                className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tablet/Mobile: Single column layout (< 1120px) */}
      <div className="min-[1120px]:hidden pb-24 min-[600px]:pb-8">
        <div className="max-w-full mx-auto px-4 min-[600px]:px-5 min-[900px]:px-6 py-8">
          {/* City and Address */}
          <div className="mb-6">
            {place.city && (
              <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-2">{place.city}</h2>
            )}
            {place.address && (
              <div className="mb-4">
                {place.lat && place.lng ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-[#6b7d47]/70 hover:text-[#6b7d47] hover:underline transition"
                  >
                    {place.address}
                  </a>
                ) : (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-[#6b7d47]/70 hover:text-[#6b7d47] hover:underline transition"
                  >
                    {place.address}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Statistics Block */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#6b7d47]/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#6b7d47]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xl font-semibold text-[#2d2d2d]">{favoritesCount}</div>
                  <div className="text-xs text-gray-600">Favorites</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#6b7d47]/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#6b7d47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xl font-semibold text-[#2d2d2d]">{commentsCount}</div>
                  <div className="text-xs text-gray-600">Comments</div>
                </div>
              </div>
            </div>
          </div>

          {/* Author Section */}
          {creatorProfile && (
            <div className="flex items-center gap-3 pb-6 mb-6 border-b border-gray-200">
              {creatorProfile.avatar_url ? (
                <img
                  src={creatorProfile.avatar_url}
                  alt={creatorName}
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#6b7d47]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-base font-semibold text-[#6b7d47]">
                    {initialsFromName(creatorProfile.display_name, creatorProfile.username)}
                  </span>
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-[#2d2d2d]">Added by {creatorName}</div>
                <div className="text-xs text-[#6b7d47]/60">{timeAgo(place.created_at)}</div>
              </div>
            </div>
          )}

          {/* Content sections */}
          <section ref={overviewRef} id="overview" className="mb-16">
            {place.description && (
              <div className="mb-6">
                {place.description.length > 300 ? (
                  <>
                    <p className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                      {place.description.substring(0, 300)}...
                    </p>
                    <button
                      onClick={() => setShowDescriptionModal(true)}
                      className="mt-3 text-base font-medium text-[#2d2d2d] hover:underline"
                    >
                      Show more
                    </button>
                  </>
                ) : (
                  <p className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                    {place.description}
                  </p>
                )}
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-[#2d2d2d] mb-3">Highlights</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full text-sm text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Actions Card - Below content on tablet/mobile */}
          <div className="mb-16 max-w-[720px] min-[600px]:max-w-full mx-auto">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="space-y-3">
                {/* Write Comment */}
                <button
                  onClick={() => scrollToSection("comments")}
                  className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Write a comment
                </button>

                {/* Add to Favorites */}
                {userId ? (
                  <button
                    onClick={toggleFavorite}
                    disabled={favoriteLoading}
                    className={cx(
                      "w-full py-3 px-4 rounded-xl border transition flex items-center justify-center gap-2 font-medium",
                      isFavorite
                        ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] hover:bg-[#6b7d47]/20"
                        : "border-gray-200 bg-white text-[#2d2d2d] hover:bg-gray-50",
                      favoriteLoading && "opacity-50"
                    )}
                  >
                    <svg
                      className="w-5 h-5"
                      fill={isFavorite ? "currentColor" : "none"}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                      />
                    </svg>
                    {isFavorite ? "Remove from favorites" : "Add to favorites"}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push("/auth")}
                    className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    Add to favorites
                  </button>
                )}

                {/* Show on Map (Google Link) */}
                {place.lat && place.lng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Show on map
                  </a>
                )}

                {/* Share */}
                <button
                  onClick={handleShare}
                  className="w-full py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[#2d2d2d] font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
              </div>
            </div>
          </div>

          {/* Other sections (Photos, Details, Map, Comments) - reuse from desktop */}
          <section ref={photosRef} id="photos" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Photos</h2>
            {allPhotos.length === 0 ? (
              <div className="text-center py-12 text-[#6b7d47]/60">No photos available</div>
            ) : (
              <div className={cx(
                "grid gap-2",
                photosExpanded || allPhotos.length <= 4
                  ? "grid-cols-2"
                  : "grid-cols-2"
              )}>
                {(photosExpanded ? allPhotos : allPhotos.slice(0, 4)).map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentPhotoIndex(index);
                      setPhotosExpanded(true);
                    }}
                    className="aspect-square rounded-xl overflow-hidden bg-[#f5f4f2] group"
                  >
                    <img
                      src={photo}
                      alt={`${place.title} - Photo ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section ref={detailsRef} id="details" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Details</h2>
            <div className="space-y-6">
              {place.address && (
                <div>
                  <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Address</h3>
                  <p className="text-sm text-[#6b7d47]/70">{place.address}</p>
                </div>
              )}
              {categories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Categories</h3>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <Link
                        key={cat}
                        href={`/?category=${encodeURIComponent(cat)}`}
                        className="px-3 py-1.5 rounded-full text-xs font-medium text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                      >
                        {cat}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full text-xs text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {creatorProfile && (
                <div>
                  <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Added by</h3>
                  <div className="flex items-center gap-3">
                    {creatorProfile.avatar_url ? (
                      <img
                        src={creatorProfile.avatar_url}
                        alt={creatorName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center">
                        <span className="text-sm font-semibold text-[#6b7d47]">
                          {initialsFromName(creatorProfile.display_name, creatorProfile.username)}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-[#2d2d2d]">{creatorName}</div>
                      <div className="text-xs text-[#6b7d47]/60">{timeAgo(place.created_at)}</div>
                    </div>
                  </div>
                </div>
              )}
              {place.link && (
                <div>
                  <a
                    href={place.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Visit Website
                  </a>
                </div>
              )}
            </div>
          </section>

          <section ref={mapRef} id="map" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Location</h2>
            {place.lat && place.lng ? (
              <div className="space-y-4">
                <div className="h-[400px] rounded-xl overflow-hidden bg-[#f5f4f2]">
                  <PlaceMapView place={place} />
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#6b7d47] text-sm font-medium hover:bg-[#f5f4f2] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open in Maps
                </a>
              </div>
            ) : (
              <div className="text-center py-12 text-[#6b7d47]/60">Location not available</div>
            )}
          </section>

          <section ref={commentsRef} id="comments" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Comments</h2>
            {userId ? (
              <div className="mb-6 rounded-xl border border-[#6b7d47]/10 bg-white p-4">
                <textarea
                  className="w-full bg-transparent text-sm outline-none text-[#2d2d2d] placeholder:text-[#6b7d47]/40 resize-none mb-3"
                  placeholder="Share your thoughts..."
                  rows={3}
                  value={commentText}
                  onChange={(e) => {
                    setCommentText(e.target.value);
                    setCommentError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (commentText.trim() && !sending) {
                        addComment();
                      }
                    }
                  }}
                />
                {commentError && (
                  <div className="mb-3 text-xs text-red-500">{commentError}</div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={addComment}
                    disabled={!commentText.trim() || sending}
                    className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] disabled:opacity-50 transition"
                  >
                    {sending ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-[#6b7d47]/10 bg-white p-4 text-center">
                <div className="text-sm text-[#6b7d47]/60 mb-2">Sign in to post comments</div>
                <button
                  onClick={() => router.push("/auth")}
                  className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                >
                  Sign In
                </button>
              </div>
            )}

            {commentsLoading ? (
              <div className="text-center py-12 text-[#6b7d47]/60">Loading comments…</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-12 text-[#6b7d47]/60">
                <div className="mb-1">No comments yet</div>
                <div className="text-sm">Be the first to share your thoughts</div>
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => {
                  const isMyComment = userId && c.user_id === userId;
                  const userName = c.user_display_name || c.user_username || "User";
                  const userAvatar = c.user_avatar_url;
                  const userInitials = initialsFromName(c.user_display_name, c.user_username);
                  
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[#6b7d47]/10 bg-white p-4"
                    >
                      <div className="flex items-start gap-3">
                        {userAvatar ? (
                          <img
                            src={userAvatar}
                            alt={userName}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-[#6b7d47]">
                              {userInitials}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-[#2d2d2d]">
                                {userName}
                              </div>
                              <div className="text-xs text-[#6b7d47]/60">
                                {timeAgo(c.created_at)}
                              </div>
                            </div>
                            {isMyComment && (
                              <button
                                onClick={() => {
                                  if (confirm("Delete this comment?")) {
                                    deleteComment(c.id);
                                  }
                                }}
                                disabled={deletingCommentId === c.id}
                                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition flex-shrink-0"
                              >
                                {deletingCommentId === c.id ? "Deleting..." : "Delete"}
                              </button>
                            )}
                          </div>
                          <div className="text-sm text-[#2d2d2d] leading-relaxed">
                            {c.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Mobile: Fixed Actions Bar (< 600px) */}
      <div className="min-[600px]:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg safe-area-bottom">
        <div className="px-2 py-2">
          <div className="grid grid-cols-4 gap-2">
            {/* Write Comment */}
            <button
              onClick={() => scrollToSection("comments")}
              className="py-2.5 px-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex flex-col items-center justify-center gap-1 text-[#2d2d2d]"
              title="Write a comment"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-[10px] font-medium">Comment</span>
            </button>

            {/* Add to Favorites */}
            {userId ? (
              <button
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                className={cx(
                  "py-2.5 px-2 rounded-xl border transition flex flex-col items-center justify-center gap-1",
                  isFavorite
                    ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47]"
                    : "border-gray-200 bg-white text-[#2d2d2d] hover:bg-gray-50",
                  favoriteLoading && "opacity-50"
                )}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <svg className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="text-[10px] font-medium">{isFavorite ? "Saved" : "Save"}</span>
              </button>
            ) : (
              <button
                onClick={() => router.push("/auth")}
                className="py-2.5 px-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex flex-col items-center justify-center gap-1 text-[#2d2d2d]"
                title="Add to favorites"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="text-[10px] font-medium">Save</span>
              </button>
            )}

            {/* Show on Map */}
            {place.lat && place.lng ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex flex-col items-center justify-center gap-1 text-[#2d2d2d]"
                title="Show on map"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[10px] font-medium">Map</span>
              </a>
            ) : (
              <div className="py-2.5 px-2 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-400 opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[10px] font-medium">Map</span>
              </div>
            )}

            {/* Share */}
            <button
              onClick={handleShare}
              className="py-2.5 px-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex flex-col items-center justify-center gap-1 text-[#2d2d2d]"
              title="Share"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span className="text-[10px] font-medium">Share</span>
            </button>
          </div>
        </div>
      </div>

      <BottomNav />

      {/* Description Modal */}
      {showDescriptionModal && place.description && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDescriptionModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-semibold text-[#2d2d2d]">About this space</h2>
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition"
                aria-label="Close"
              >
                <svg className="w-6 h-6 text-[#2d2d2d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                {place.description}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Map View Component
function PlaceMapView({ place }: { place: Place }) {
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  if (!place.lat || !place.lng) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#6b7d47]/60">
        Location not available
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#6b7d47]/60">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: place.lat, lng: place.lng }}
      zoom={15}
      options={{
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      }}
    >
      <Marker
        position={{ lat: place.lat, lng: place.lng }}
        title={place.title}
      />
    </GoogleMap>
  );
}
