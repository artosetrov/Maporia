"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES, DEFAULT_CITY } from "../../constants";
import TopBar from "../../components/TopBar";
import DesktopMosaic from "../../components/DesktopMosaic";
import MobileCarousel from "../../components/MobileCarousel";
import FiltersModal, { ActiveFilters } from "../../components/FiltersModal";
import FavoriteIcon from "../../components/FavoriteIcon";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../../config/googleMaps";
import { supabase } from "../../lib/supabase";
import { PLACE_LAYOUT_CONFIG } from "../../config/placeLayout";
import { useUserAccess } from "../../hooks/useUserAccess";
import { isPlacePremium, canUserViewPlace } from "../../lib/access";
import LockedPlaceOverlay from "../../components/LockedPlaceOverlay";
import PremiumBadge from "../../components/PremiumBadge";

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

  const [activeSection, setActiveSection] = useState<"overview" | "photos" | "map" | "comments">("overview");
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
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    vibes: [],
    categories: [],
    sort: null,
  });
  const [galleryPhotoIndex, setGalleryPhotoIndex] = useState(0);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPosition, setPhotoPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(null);
  const galleryImageRef = useRef<HTMLImageElement>(null);

  // User access for premium checks
  const { loading: accessLoading, access } = useUserAccess();

  // Close modal on ESC key and prevent body scroll when gallery is open
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photoGalleryOpen) {
          setPhotoGalleryOpen(false);
          setPhotoZoom(1);
          setPhotoPosition({ x: 0, y: 0 });
        } else if (showDescriptionModal) {
          setShowDescriptionModal(false);
        }
      }
    };
    window.addEventListener("keydown", handleEsc);
    
    // Prevent body scroll when gallery is open
    if (photoGalleryOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = '';
    };
  }, [photoGalleryOpen, showDescriptionModal]);

  // Photo gallery handlers
  const handleNextPhoto = () => {
    if (allPhotos.length > 0) {
      setGalleryPhotoIndex((prev) => (prev < allPhotos.length - 1 ? prev + 1 : 0));
      setPhotoZoom(1);
      setPhotoPosition({ x: 0, y: 0 });
    }
  };

  const handlePrevPhoto = () => {
    if (allPhotos.length > 0) {
      setGalleryPhotoIndex((prev) => (prev > 0 ? prev - 1 : allPhotos.length - 1));
      setPhotoZoom(1);
      setPhotoPosition({ x: 0, y: 0 });
    }
  };

  const handlePhotoDoubleClick = () => {
    if (photoZoom === 1) {
      setPhotoZoom(2);
    } else {
      setPhotoZoom(1);
      setPhotoPosition({ x: 0, y: 0 });
    }
  };

  const handleGalleryTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom start
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      setPinchStartDistance(distance);
      setIsDragging(false);
      setSwipeStart(null);
    } else if (e.touches.length === 1 && photoZoom > 1) {
      // Drag when zoomed
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - photoPosition.x, y: e.touches[0].clientY - photoPosition.y });
      setSwipeStart(null);
      setPinchStartDistance(null);
    } else if (e.touches.length === 1 && photoZoom === 1) {
      // Swipe navigation
      setSwipeStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setIsDragging(false);
      setPinchStartDistance(null);
    }
  };

  const handleGalleryTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistance !== null) {
      // Pinch zoom
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      const scale = distance / pinchStartDistance;
      const newZoom = Math.max(1, Math.min(3, photoZoom * scale));
      setPhotoZoom(newZoom);
    } else if (isDragging && photoZoom > 1 && e.touches.length === 1) {
      // Drag when zoomed
      e.preventDefault();
      const newX = e.touches[0].clientX - dragStart.x;
      const newY = e.touches[0].clientY - dragStart.y;
      setPhotoPosition({ x: newX, y: newY });
    }
  };

  const handleGalleryTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0 && swipeStart && photoZoom === 1 && !isDragging) {
      // Swipe navigation
      const touch = e.changedTouches[0];
      const distance = swipeStart.x - touch.clientX;
      const minSwipeDistance = 50;

      if (Math.abs(distance) > minSwipeDistance) {
        if (distance > 0) {
          handleNextPhoto();
        } else {
          handlePrevPhoto();
        }
      }
    }
    setIsDragging(false);
    setSwipeStart(null);
    setPinchStartDistance(null);
  };

  // Refs for smooth scrolling
  const overviewRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<HTMLDivElement>(null);
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


  // Active section detection on scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 100;
      
      if (commentsRef.current && scrollPos >= commentsRef.current.offsetTop - 200) {
        setActiveSection("comments");
      } else if (mapRef.current && scrollPos >= mapRef.current.offsetTop - 200) {
        setActiveSection("map");
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
  const scrollToSection = (section: "overview" | "photos" | "map" | "comments") => {
    setActiveSection(section);
    const refs = {
      overview: overviewRef,
      photos: photosRef,
      map: mapRef,
      comments: commentsRef,
    };
    const ref = refs[section];
    if (ref.current) {
      const offset = 80; // Account for top bar
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

  // Helper function to save place to recently viewed
  function saveToRecentlyViewed(placeId: string) {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('recentlyViewedPlaces');
      let placeIds: string[] = stored ? JSON.parse(stored) : [];
      
      // Remove if already exists (to avoid duplicates)
      placeIds = placeIds.filter((id: string) => id !== placeId);
      
      // Add to the beginning (most recent first)
      placeIds.unshift(placeId);
      
      // Keep only last 20 places
      placeIds = placeIds.slice(0, 20);
      
      localStorage.setItem('recentlyViewedPlaces', JSON.stringify(placeIds));
    } catch (error) {
      console.error('Error saving to recently viewed:', error);
    }
  }

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
      
      // Save to recently viewed
      saveToRecentlyViewed(id);

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

  // Calculate active filters count
  const activeFiltersCount = useMemo(() => {
    return (activeFilters.vibes?.length || 0) + 
           (activeFilters.categories?.length || 0) + 
           (activeFilters.sort ? 1 : 0);
  }, [activeFilters]);

  // Handle filters
  const handleFiltersClick = () => {
    setFilterOpen(true);
  };

  const handleFiltersApply = (filters: ActiveFilters) => {
    setActiveFilters(filters);
    // Redirect to map page with filters
    const params = new URLSearchParams();
    if (filters.categories.length > 0) {
      params.set("categories", filters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    if (filters.vibes.length > 0) {
      params.set("tags", filters.vibes.map(v => encodeURIComponent(v)).join(','));
    }
    if (filters.sort) {
      params.set("sort", filters.sort);
    }
    router.push(`/map?${params.toString()}`);
  };

  // Premium access check
  const isPremium = place ? isPlacePremium(place) : false;
  const canView = place ? canUserViewPlace(access, place) : true;
  const isLocked = isPremium && !canView && !isOwner; // Owner always sees full content (isOwner defined above)

  // Generate pseudo title for locked places
  const getPseudoPlaceNumber = (placeId: string): number => {
    const hash = placeId.replace(/-/g, '').substring(0, 8);
    const num = parseInt(hash, 16) % 9999;
    return num + 1; // Ensure it's between 1-9999
  };

  if (!place) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading…</div>
      </main>
    );
  }

  // Show locked screen if place is premium and user doesn't have access
  // Wait for access loading to complete to avoid flashing
  if (accessLoading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading…</div>
      </main>
    );
  }

  if (isLocked) {
    const pseudoTitle = `Maporia Secret #${getPseudoPlaceNumber(place.id)}`;
    return (
      <main className="min-h-screen bg-white">
        <TopBar
          showBackButton={true}
          onBackClick={() => router.back()}
          userAvatar={userAvatar}
          userDisplayName={userDisplayName}
          userEmail={userEmail}
        />
        <div className="relative min-h-[60vh] flex items-center justify-center p-6">
          {/* Blurred cover image in background */}
          {place.cover_url && (
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-20 blur-2xl scale-110"
              style={{ backgroundImage: `url(${place.cover_url})` }}
            />
          )}
          
          {/* Locked content */}
          <div className="relative z-10 max-w-md w-full">
            <LockedPlaceOverlay
              placeTitle={pseudoTitle}
              coverUrl={place.cover_url || undefined}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <TopBar
        showSearchBar={true}
        searchValue={""}
        onSearchChange={(value) => {
          // Redirect to map page with search
          const params = new URLSearchParams();
          if (value.trim()) params.set("q", value);
          if (activeFilters.categories.length > 0) {
            params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={null}
        onCityChange={(city) => {
          // Redirect to map page with city
          const params = new URLSearchParams();
          if (city) params.set("city", city);
          if (activeFilters.categories.length > 0) {
            params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        onFiltersClick={handleFiltersClick}
        activeFiltersCount={activeFiltersCount}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        showBackButton={true}
        onBackClick={() => router.back()}
        onShareClick={handleShare}
        onFavoriteClick={toggleFavorite}
        isFavorite={isFavorite}
        favoriteLoading={favoriteLoading}
      />


      {/* Title Row - Desktop (>= 1120px): Before gallery */}
      <div className="hidden min-[1120px]:block pt-[80px]">
        <div className="max-w-[1280px] min-[1120px]:max-w-[1120px] min-[1440px]:max-w-[1280px] mx-auto px-6">
          <div className="flex items-center justify-between gap-4 mb-6 pt-12">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <h1 className="font-fraunces text-2xl font-semibold text-[#1F2A1F]">{place.title}</h1>
              {isPremium && (
                <div className="flex items-center gap-2">
                  <PremiumBadge />
                  {/* Show pseudo title badge for owner to see what others see */}
                  {isOwner && (
                    <div className="px-3 py-1.5 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] text-[#6F7A5A] text-xs font-medium badge-shadow">
                      {`Maporia Secret #${getPseudoPlaceNumber(place.id)}`}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isOwner && (
                <button
                  onClick={() => router.push(`/places/${id}/edit`)}
                  className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-[#1F2A1F]"
                  aria-label="Edit place"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              <button
                onClick={handleShare}
                className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-[#1F2A1F]"
                aria-label="Share"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Share
              </button>
              {userId ? (
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "h-11 px-5 rounded-xl border transition-colors flex items-center justify-center gap-2 text-sm font-medium",
                    isFavorite
                      ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] hover:bg-[#ECEEE4]"
                      : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                    favoriteLoading && "opacity-50"
                  )}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <FavoriteIcon isActive={isFavorite} size={16} />
                  Add to favorites
                </button>
              ) : (
                <button
                  onClick={() => router.push("/auth")}
                  className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-[#1F2A1F]"
                  aria-label="Add to favorites"
                >
                  <FavoriteIcon isActive={false} size={16} />
                  Add to favorites
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
            onPhotoClick={(index) => {
              setGalleryPhotoIndex(index);
              setPhotoGalleryOpen(true);
              setPhotoZoom(1);
              setPhotoPosition({ x: 0, y: 0 });
            }}
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
          onPhotoClick={(index) => {
            setGalleryPhotoIndex(index);
            setPhotoGalleryOpen(true);
            setPhotoZoom(1);
            setPhotoPosition({ x: 0, y: 0 });
          }}
        />
        
        {/* Mobile App Bar - Back, Share, Heart */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#1F2A1F] hover:bg-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={() => router.push(`/places/${id}/edit`)}
                className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#1F2A1F] hover:bg-white transition-colors"
                aria-label="Edit place"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {userId && (
              <button
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                className={cx(
                  "h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center transition-colors",
                  isFavorite ? "text-[#8F9E4F]" : "text-[#A8B096]",
                  favoriteLoading && "opacity-50"
                )}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <FavoriteIcon isActive={isFavorite} size={20} />
              </button>
            )}
            <button
              onClick={handleShare}
              className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#1F2A1F] hover:bg-white transition-colors"
              aria-label="Share"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>


      {/* Mobile/Tablet: Bottom sheet with title (mobile only) */}
      <div className="min-[900px]:hidden">
        <div className="bg-white rounded-t-[24px] -mt-8 relative z-10 px-6 pt-12 pb-0">
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-fraunces text-2xl font-semibold text-[#1F2A1F] mb-0 line-clamp-2 text-center">{place.title}</h1>
            {isPremium && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <PremiumBadge />
                {/* Show pseudo title badge for owner to see what others see */}
                {isOwner && (
                  <div className="px-3 py-1.5 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] text-[#6F7A5A] text-xs font-medium">
                    {`Maporia Secret #${getPseudoPlaceNumber(place.id)}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tablet: Title section */}
      <div className="hidden min-[600px]:max-[899px]:block max-w-full mx-auto px-5 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3 pt-12">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="font-fraunces text-2xl font-semibold text-[#1F2A1F]">{place.title}</h1>
              {isPremium && (
                <div className="flex items-center gap-2">
                  <PremiumBadge />
                  {/* Show pseudo title badge for owner to see what others see */}
                  {isOwner && (
                    <div className="px-3 py-1.5 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] text-[#6F7A5A] text-xs font-medium badge-shadow">
                      {`Maporia Secret #${getPseudoPlaceNumber(place.id)}`}
                    </div>
                  )}
                </div>
              )}
            </div>
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
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">{place.city}</h2>
          )}
          {place.address && (
            <div className="mb-4">
              {place.lat && place.lng ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-[#8F9E4F]/70 hover:text-[#8F9E4F] hover:underline transition"
                >
                  {place.address}
                </a>
              ) : (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-[#8F9E4F]/70 hover:text-[#8F9E4F] hover:underline transition"
                >
                  {place.address}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Statistics Block */}
        <div className="rounded-xl bg-[#FAFAF7] border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Favorites count */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
                <FavoriteIcon isActive={true} size={24} />
              </div>
              <div>
                <div className="text-2xl font-semibold text-[#1F2A1F]">{favoritesCount}</div>
                <div className="text-sm text-[#6F7A5A]">Added to favorites</div>
              </div>
            </div>

            {/* Right: Comments count */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#FAFAF7] flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[#8F9E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[#1F2A1F]">{commentsCount}</div>
                <div className="text-sm text-[#6F7A5A]">Comments</div>
              </div>
            </div>
          </div>
        </div>

        {/* Author Section */}
        {creatorProfile && (
          <div className="flex items-center gap-4 pb-6 mb-6 border-b border-[#ECEEE4]">
            {creatorProfile.avatar_url ? (
              <img
                src={creatorProfile.avatar_url}
                alt={creatorName}
                className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-semibold text-[#8F9E4F]">
                  {initialsFromName(creatorProfile.display_name, creatorProfile.username)}
                </span>
              </div>
            )}
            <div>
              <div className="text-base font-semibold text-[#1F2A1F]">Added by {creatorName}</div>
              <div className="text-sm text-[#8F9E4F]/60">{timeAgo(place.created_at)}</div>
            </div>
          </div>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className="pb-6 mb-6 border-b border-[#ECEEE4]">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/?category=${encodeURIComponent(cat)}`}
                  className="px-3 py-1.5 rounded-full text-sm font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#6b7d47]/20 hover:bg-[#FAFAF7] transition"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Overview Section */}
        <section ref={overviewRef} id="overview" className="mb-16">
          {place.description && (
            <div className="mb-6">
              {place.description.length > 300 ? (
                <>
                  <p className="text-base text-[#1F2A1F] leading-relaxed whitespace-pre-wrap">
                    {place.description.substring(0, 300)}...
                  </p>
                  <button
                    onClick={() => setShowDescriptionModal(true)}
                    className="mt-4 w-full max-[599px]:w-full min-[600px]:w-auto min-[600px]:inline-block h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors text-base font-medium text-[#1F2A1F]"
                  >
                    Show more
                  </button>
                </>
              ) : (
                <p className="text-base text-[#1F2A1F] leading-relaxed whitespace-pre-wrap">
                  {place.description}
                </p>
              )}
            </div>
          )}

          {/* Highlights */}
          {tags.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-[#1F2A1F] mb-3">Highlights</h3>
              <div className="flex flex-wrap gap-2">
                {tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full text-sm text-[#8F9E4F] bg-[#FAFAF7] border border-[#6b7d47]/20"
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
          <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Photos</h2>
          {allPhotos.length === 0 ? (
            <div className="text-center py-12 text-[#8F9E4F]/60">No photos available</div>
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
                      setGalleryPhotoIndex(index);
                      setPhotoGalleryOpen(true);
                      setPhotoZoom(1);
                      setPhotoPosition({ x: 0, y: 0 });
                    }}
                    className="aspect-square rounded-xl overflow-hidden bg-[#FAFAF7] group"
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
                  className="mt-4 w-full py-3 rounded-xl border border-[#6b7d47]/20 text-[#8F9E4F] font-medium hover:bg-[#FAFAF7] transition"
                >
                  Show all {allPhotos.length} photos
                </button>
              )}
            </>
          )}
        </section>

        {/* Map Section */}
        <section ref={mapRef} id="map" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Location</h2>
          {place.lat && place.lng ? (
            <div className="space-y-4">
              <div className="h-[400px] lg:h-[500px] rounded-xl overflow-hidden bg-[#FAFAF7]">
                <PlaceMapView place={place} />
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#8F9E4F] text-sm font-medium hover:bg-[#FAFAF7] transition min-[600px]:inline-flex max-[599px]:w-full max-[599px]:py-3 max-[599px]:border-gray-200 max-[599px]:bg-white max-[599px]:text-[#1F2A1F] max-[599px]:text-base max-[599px]:hover:bg-[#FAFAF7]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in Maps
              </a>
            </div>
          ) : (
            <div className="text-center py-12 text-[#8F9E4F]/60">Location not available</div>
          )}
        </section>

        {/* Comments Section */}
        <section ref={commentsRef} id="comments" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Comments</h2>

          {/* Add comment */}
          {userId ? (
            <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-white p-4">
              <textarea
                className="w-full bg-transparent text-sm outline-none text-[#1F2A1F] placeholder:text-[#8F9E4F]/40 resize-none mb-3"
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
                  className="h-11 px-5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:brightness-110 active:brightness-90 disabled:opacity-50 disabled:bg-[#DADDD0] transition-all"
                >
                  {sending ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-white p-4 text-center">
              <div className="text-sm text-[#8F9E4F]/60 mb-2">Sign in to post comments</div>
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
            <div className="text-center py-12 text-[#8F9E4F]/60">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-[#8F9E4F]/60">
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
                    className="rounded-xl border border-[#ECEEE4] bg-white p-4"
                  >
                    <div className="flex items-start gap-3">
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt={userName}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-[#8F9E4F]">
                            {userInitials}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[#1F2A1F]">
                              {userName}
                            </div>
                            <div className="text-xs text-[#8F9E4F]/60">
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
                        <div className="text-sm text-[#1F2A1F] leading-relaxed">
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
          <div className="sticky top-24 rounded-2xl border border-[#ECEEE4] bg-white p-6 shadow-sm" style={{ maxWidth: PLACE_LAYOUT_CONFIG.desktopXL.bookingCardMaxWidth }}>
            <div className="space-y-4">
              {/* Write Comment */}
              <button
                onClick={() => scrollToSection("comments")}
                className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
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
                      ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] hover:bg-[#ECEEE4]"
                      : "border-gray-200 bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                    favoriteLoading && "opacity-50"
                  )}
                >
                  <FavoriteIcon isActive={isFavorite} size={20} />
                  {isFavorite ? "Remove from favorites" : "Add to favorites"}
                </button>
              ) : (
                <button
                  onClick={() => router.push("/auth")}
                  className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
                >
                  <FavoriteIcon isActive={false} size={20} />
                  Add to favorites
                </button>
              )}

              {/* Show on Map (Google Link) */}
              {place.lat && place.lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
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
                className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tablet/Mobile: Single column layout (< 1120px) */}
      <div className="min-[1120px]:hidden pb-24 min-[600px]:pb-8">
        <div className="max-w-full mx-auto px-6 min-[600px]:px-5 min-[900px]:px-6 max-[599px]:pt-4 min-[600px]:pt-8 pb-8">
          {/* City and Address */}
          <div className="mb-6 max-[599px]:text-center min-[600px]:text-left">
            {place.city && (
              <h2 className="text-sm font-medium text-[#1F2A1F] mb-2">{place.city}</h2>
            )}
            {place.address && (
              <div className="mb-4">
                {place.lat && place.lng ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-[#8F9E4F]/70 hover:text-[#8F9E4F] hover:underline transition"
                  >
                    {place.address}
                  </a>
                ) : (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-[#8F9E4F]/70 hover:text-[#8F9E4F] hover:underline transition"
                  >
                    {place.address}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Statistics Block */}
          <div className="rounded-xl bg-[#FAFAF7] border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
                  <FavoriteIcon isActive={true} size={20} />
                </div>
                <div>
                  <div className="text-xl font-semibold text-[#1F2A1F]">{favoritesCount}</div>
                  <div className="text-xs text-[#6F7A5A]">Favorites</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FAFAF7] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#8F9E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xl font-semibold text-[#1F2A1F]">{commentsCount}</div>
                  <div className="text-xs text-[#6F7A5A]">Comments</div>
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
                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
                  <span className="text-base font-semibold text-[#8F9E4F]">
                    {initialsFromName(creatorProfile.display_name, creatorProfile.username)}
                  </span>
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-[#1F2A1F]">Added by {creatorName}</div>
                <div className="text-xs text-[#8F9E4F]/60">{timeAgo(place.created_at)}</div>
              </div>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div className="pb-6 mb-6 border-b border-[#ECEEE4]">
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <Link
                    key={cat}
                    href={`/?category=${encodeURIComponent(cat)}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#6b7d47]/20 hover:bg-[#FAFAF7] transition"
                  >
                    {cat}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Content sections */}
          <section ref={overviewRef} id="overview" className="mb-16">
            {place.description && (
              <div className="mb-6">
                {place.description.length > 300 ? (
                  <>
                    <p className="text-base text-[#1F2A1F] leading-relaxed whitespace-pre-wrap">
                      {place.description.substring(0, 300)}...
                    </p>
                    {/* Desktop: Show more with underline */}
                    <button
                      onClick={() => setShowDescriptionModal(true)}
                      className="mt-3 text-base font-medium text-[#1F2A1F] hover:underline min-[600px]:block max-[599px]:hidden"
                    >
                      Show more
                    </button>
                    {/* Mobile: Show more button with border */}
                    <button
                      onClick={() => setShowDescriptionModal(true)}
                      className="mt-4 w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors text-base font-medium text-[#1F2A1F] min-[600px]:hidden"
                    >
                      Show more
                    </button>
                  </>
                ) : (
                  <p className="text-base text-[#1F2A1F] leading-relaxed whitespace-pre-wrap">
                    {place.description}
                  </p>
                )}
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-3">Highlights</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full text-sm text-[#8F9E4F] bg-[#FAFAF7] border border-[#6b7d47]/20"
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
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 shadow-sm">
              <div className="space-y-3">
                {/* Write Comment */}
                <button
                  onClick={() => scrollToSection("comments")}
                  className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
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
                        ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] hover:bg-[#ECEEE4]"
                        : "border-gray-200 bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                      favoriteLoading && "opacity-50"
                    )}
                  >
                    <FavoriteIcon isActive={isFavorite} size={20} />
                    {isFavorite ? "Remove from favorites" : "Add to favorites"}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push("/auth")}
                    className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
                  >
                    <FavoriteIcon isActive={false} size={20} />
                    Add to favorites
                  </button>
                )}

                {/* Show on Map (Google Link) */}
                {place.lat && place.lng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
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
                  className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Share
                </button>
              </div>
            </div>
          </div>

          {/* Other sections (Photos, Details, Map, Comments) - reuse from desktop */}
          <section ref={photosRef} id="photos" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Photos</h2>
            {allPhotos.length === 0 ? (
              <div className="text-center py-12 text-[#8F9E4F]/60">No photos available</div>
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
                      setGalleryPhotoIndex(index);
                      setPhotoGalleryOpen(true);
                      setPhotoZoom(1);
                      setPhotoPosition({ x: 0, y: 0 });
                    }}
                    className="aspect-square rounded-xl overflow-hidden bg-[#FAFAF7] group"
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

          <section ref={mapRef} id="map" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Location</h2>
            {place.lat && place.lng ? (
              <div className="space-y-4">
                <div className="h-[400px] rounded-xl overflow-hidden bg-[#FAFAF7]">
                  <PlaceMapView place={place} />
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#8F9E4F] text-sm font-medium hover:bg-[#FAFAF7] transition min-[600px]:inline-flex max-[599px]:w-full max-[599px]:py-3 max-[599px]:border-gray-200 max-[599px]:bg-white max-[599px]:text-[#1F2A1F] max-[599px]:text-base max-[599px]:hover:bg-[#FAFAF7]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open in Maps
                </a>
              </div>
            ) : (
              <div className="text-center py-12 text-[#8F9E4F]/60">Location not available</div>
            )}
          </section>

          <section ref={commentsRef} id="comments" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Comments</h2>
            {userId ? (
              <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-white p-4">
                <textarea
                  className="w-full bg-transparent text-sm outline-none text-[#1F2A1F] placeholder:text-[#8F9E4F]/40 resize-none mb-3"
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
                  <div className="mb-3 text-xs text-[#C96A5B]">{commentError}</div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={addComment}
                    disabled={!commentText.trim() || sending}
                    className="h-11 px-5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:brightness-110 active:brightness-90 disabled:opacity-50 disabled:bg-[#DADDD0] transition-all"
                  >
                    {sending ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-white p-4 text-center">
                <div className="text-sm text-[#8F9E4F]/60 mb-2">Sign in to post comments</div>
                <button
                  onClick={() => router.push("/auth")}
                  className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                >
                  Sign In
                </button>
              </div>
            )}

            {commentsLoading ? (
              <div className="text-center py-12 text-[#8F9E4F]/60">Loading comments…</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-12 text-[#8F9E4F]/60">
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
                      className="rounded-xl border border-[#ECEEE4] bg-white p-4"
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
                            <span className="text-sm font-semibold text-[#8F9E4F]">
                              {userInitials}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-[#1F2A1F]">
                                {userName}
                              </div>
                              <div className="text-xs text-[#8F9E4F]/60">
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
                          <div className="text-sm text-[#1F2A1F] leading-relaxed">
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
      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={handleFiltersApply}
        appliedFilters={activeFilters}
        getFilteredCount={async (draftFilters: ActiveFilters) => {
          // Подсчитываем количество мест с учетом фильтров
          try {
            let countQuery = supabase.from("places").select("*", { count: 'exact', head: true });

            // Фильтрация по категориям
            if (draftFilters.categories.length > 0) {
              countQuery = countQuery.overlaps("categories", draftFilters.categories);
            }

            // Фильтрация по тегам (vibes)
            if (draftFilters.vibes.length > 0) {
              countQuery = countQuery.overlaps("tags", draftFilters.vibes);
            }

            const { count, error } = await countQuery;
            if (error) {
              console.error("Error counting filtered places:", error);
              return 0;
            }
            return count || 0;
          } catch (error) {
            console.error("Error in getFilteredCount:", error);
            return 0;
          }
        }}
      />

      {/* Photo Gallery Modal */}
      {photoGalleryOpen && allPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black"
          onTouchStart={handleGalleryTouchStart}
          onTouchMove={handleGalleryTouchMove}
          onTouchEnd={handleGalleryTouchEnd}
        >
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 pt-safe-top">
            {/* Back button */}
            <button
              onClick={() => {
                setPhotoGalleryOpen(false);
                setPhotoZoom(1);
                setPhotoPosition({ x: 0, y: 0 });
              }}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
              aria-label="Back"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Photo counter */}
            <div className="absolute left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1.5 badge-shadow">
              <span className="text-white text-sm font-medium">
                {galleryPhotoIndex + 1} / {allPhotos.length}
              </span>
            </div>

            {/* Share button */}
            <button
              onClick={handleShare}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
              aria-label="Share"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </button>
          </div>

          {/* Photo container */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              className="relative w-full h-full flex items-center justify-center"
              style={{
                transform: `translate(${photoPosition.x}px, ${photoPosition.y}px) scale(${photoZoom})`,
                transition: isDragging ? 'none' : 'transform 0.3s ease-out',
              }}
            >
              <img
                ref={galleryImageRef}
                src={allPhotos[galleryPhotoIndex]}
                alt={`${place.title} - Photo ${galleryPhotoIndex + 1}`}
                className="max-w-full max-h-full object-contain"
                onDoubleClick={handlePhotoDoubleClick}
                draggable={false}
              />
            </div>
          </div>

          {/* Navigation buttons (desktop) */}
          {allPhotos.length > 1 && (
            <>
              <button
                onClick={handlePrevPhoto}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition min-[600px]:block max-[599px]:hidden"
                aria-label="Previous photo"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleNextPhoto}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition min-[600px]:block max-[599px]:hidden"
                aria-label="Next photo"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Keyboard navigation */}
          {typeof window !== 'undefined' && (
            <div
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') handlePrevPhoto();
                if (e.key === 'ArrowRight') handleNextPhoto();
                if (e.key === 'Escape') {
                  setPhotoGalleryOpen(false);
                  setPhotoZoom(1);
                  setPhotoPosition({ x: 0, y: 0 });
                }
              }}
              className="absolute inset-0"
              style={{ outline: 'none' }}
            />
          )}
        </div>
      )}

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
            <div className="flex items-center justify-between p-6 border-b border-[#ECEEE4]">
              <h2 className="text-2xl font-semibold text-[#1F2A1F]">About this space</h2>
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="p-2 rounded-full hover:bg-[#FAFAF7] transition"
                aria-label="Close"
              >
                <svg className="w-6 h-6 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="text-base text-[#1F2A1F] leading-relaxed whitespace-pre-wrap">
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
      <div className="w-full h-full flex items-center justify-center text-[#8F9E4F]/60">
        Location not available
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#8F9E4F]/60">
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
