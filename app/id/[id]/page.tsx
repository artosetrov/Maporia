"use client";

import { use, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "../../providers/GoogleMapsProvider";
import { createStaticPinSvg } from "../../lib/mapMarkers";
// NOTE: AdvancedMarkerElement requires NEXT_PUBLIC_GOOGLE_MAP_ID. Until that
// env var is set on Vercel + a Map ID is provisioned in Google Cloud, we
// stay on the deprecated <Marker>. See app/components/AdvancedPinMarker.tsx
// for the ready-to-use replacement.
import TopBar from "../../components/TopBar";
import DesktopMosaic from "../../components/DesktopMosaic";
import MobileCarousel from "../../components/MobileCarousel";
import { type ActiveFilters } from "../../components/FiltersModal";
// Heavy modals — only loaded when the user opens them.
import nextDynamic from "next/dynamic";
const FiltersModal = nextDynamic(() => import("../../components/FiltersModal"), { ssr: false });
const SearchModal = nextDynamic(() => import("../../components/SearchModal"), { ssr: false });
import FavoriteIcon from "../../components/FavoriteIcon";
import { getMapOptions } from "../../config/googleMaps";
import { supabase } from "../../lib/supabase";
import { PLACE_LAYOUT_CONFIG } from "../../config/placeLayout";
import { useUserAccessContext } from "../../contexts/UserAccessContext";
import { usePremiumModalContext } from "../../contexts/PremiumModalContext";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import AuthCTA from "../../components/AuthCTA";
import { isPlacePremium, canUserViewPlace, isUserAdmin } from "../../lib/access";
import LockedPlaceOverlay from "../../components/LockedPlaceOverlay";
import PremiumBadge from "../../components/PremiumBadge";
import Icon from "../../components/Icon";
import { MapSkeleton } from "../../components/Skeleton";
import { convertInstagramReelToEmbed, filterValidPhotos } from "../../utils";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import OfferPlaceView from "./_views/OfferPlaceView";
import LocationChildrenSection from "./_views/LocationChildrenSection";
import StarRating from "../../components/StarRating";
import PlaceContacts from "../../components/PlaceContacts";
import TransientNotice from "../../components/TransientNotice";
import ConfirmDialog from "../../components/ConfirmDialog";
import ErrorPage from "../../components/ErrorPage";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  link: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  telegram?: string | null;
  tags: string[] | null;
  categories: string[] | null;
  cover_url: string | null;
  photo_urls: string[] | null;
  video_url?: string | null;
  created_by: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  comments_enabled?: boolean | null;
  google_place_id?: string | null;
  // --- Новые поля для услуг и экспириенсов ---
  kind?: "location" | "service" | "experience" | null;
  price_amount?: number | null;
  price_currency?: string | null;
  price_unit?: string | null;
  duration_minutes?: number | null;
  schedule?: unknown | null; // jsonb — конкретный тип в app/types/supabase.ts (PlaceSchedule)
  host_qualification?: string | null;
  service_mode?: 'at_provider' | 'at_client' | 'online' | 'flexible' | null;
  max_guests?: number | null;
  min_guests?: number | null;
  meeting_point?: string | null;
  cancellation_policy?: 'flexible' | 'moderate' | 'strict' | 'non_refundable' | 'custom' | null;
  included_items?: string[] | null;
  bring_items?: string[] | null;
};

type Comment = {
  id: string;
  text: string;
  rating: number | null; // 1..5, NULL для legacy комментариев без оценки
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

type ProfileData = {
  display_name: string | null;
  username?: string | null;
  avatar_url: string | null;
};

type ErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type CommentData = {
  id: string;
  text: string;
  rating: number | null;
  created_at: string;
  user_id: string;
};

type CommentProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const toErrorLike = (error: unknown): ErrorLike => {
  if (error && typeof error === "object") return error as ErrorLike;
  return { message: String(error) };
};

const isAbortLikeError = (error: unknown): boolean => {
  const err = toErrorLike(error);
  return (
    err.name === "AbortError" ||
    err.message?.includes("abort") === true ||
    err.code === "ECONNABORTED"
  );
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

type PageProps = { params: Promise<{ id: string }> };

export default function PlacePage(props: PageProps) {
  const router = useRouter();
  const { id } = use(props.params);
  const { redirectToAuth } = useAuthRedirect();

  const [, setActiveSection] = useState<"overview" | "photos" | "map" | "comments">("overview");
  const [place, setPlace] = useState<Place | null>(null);
  const [placeNotFound, setPlaceNotFound] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState<number>(0); // 0 = не выбрано
  const [placeRating, setPlaceRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
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
  const [commentToDeleteId, setCommentToDeleteId] = useState<string | null>(null);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState<number>(0);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [isImageTransitioning, setIsImageTransitioning] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
  });
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [galleryPhotoIndex, setGalleryPhotoIndex] = useState(0);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPosition, setPhotoPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(null);
  const [placeCollections, setPlaceCollections] = useState<{ id: string; title: string; description: string | null; cover_image: string | null; access_type: string }[]>([]);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User access for premium checks and render gate (from context — single session/profile request)
  const { loading: accessLoading, access, user: ctxUser, profile: ctxProfile } = useUserAccessContext();
  const { openPremiumModal } = usePremiumModalContext();
  const isAdmin = isUserAdmin(access);

  // Close modal on ESC key and prevent body scroll when gallery is open
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photoGalleryOpen) {
          setPhotoGalleryOpen(false);
          setIsImageTransitioning(false);
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

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  function showNotice(message: string, variant: "success" | "error" = "success") {
    setNotice({ message, variant });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, 4000);
  }

  // Photo gallery handlers
  const handleNextPhoto = () => {
    if (allPhotos.length > 0) {
      setIsImageTransitioning(true);
      setTimeout(() => {
        setGalleryPhotoIndex((prev) => (prev < allPhotos.length - 1 ? prev + 1 : 0));
        setPhotoZoom(1);
        setPhotoPosition({ x: 0, y: 0 });
        setTimeout(() => setIsImageTransitioning(false), 50);
      }, 150);
    }
  };

  const handlePrevPhoto = () => {
    if (allPhotos.length > 0) {
      setIsImageTransitioning(true);
      setTimeout(() => {
        setGalleryPhotoIndex((prev) => (prev > 0 ? prev - 1 : allPhotos.length - 1));
        setPhotoZoom(1);
        setPhotoPosition({ x: 0, y: 0 });
        setTimeout(() => setIsImageTransitioning(false), 50);
      }, 150);
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

  const closePhotoGallery = () => {
    setPhotoGalleryOpen(false);
    setIsImageTransitioning(false);
    setPhotoZoom(1);
    setPhotoPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setDragStart({ x: 0, y: 0 });
    setSwipeStart(null);
    setPinchStartDistance(null);
  };

  const isGalleryControlTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('[data-gallery-control="true"]'));

  const stopGalleryControlTouch = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleGalleryClosePress = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closePhotoGallery();
  };

  const handleGalleryTouchStart = (e: React.TouchEvent) => {
    if (isGalleryControlTarget(e.target)) return;

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
    if (isGalleryControlTarget(e.target)) return;

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
    if (isGalleryControlTarget(e.target)) return;

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

  const tags = useMemo(() => place?.tags ?? [], [place?.tags]);
  const categories = useMemo(() => place?.categories ?? [], [place?.categories]);
  const isOwner = place?.created_by === userId;
  // Owner or admin can edit - compute after place and isAdmin are available
  const canEdit = (place && (isOwner || isAdmin)) || false;

  // Photos are now loaded inside the main place useEffect's Promise.all
  // (see below). This state still exists so the rest of the page can read it,
  // but it's set from the batched fetch instead of a separate request.
  const [loadedPhotos, setLoadedPhotos] = useState<string[]>([]);

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
    return filterValidPhotos(photos);
  }, [loadedPhotos, place]);


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
    if (ref?.current) {
      const offset = 100; // Account for top bar and padding
      
      // Try to find element by ID first (more reliable)
      const elementById = document.getElementById(section);
      const targetElement = elementById || ref.current;
      
      if (targetElement) {
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - offset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    }
  };

  // Was: a duplicate auth.getUser() + profiles.select() pair. Removed — both
  // pieces of data are already loaded by UserAccessProvider at app shell
  // level (RootLayout). We just mirror the context values into local state
  // so the rest of this file can keep using `userId` / `userDisplayName` /
  // `userAvatar` unchanged. Saves: one auth round-trip + one profile fetch
  // per /id/[id] open.
  useEffect(() => {
    setUserId(ctxUser?.id ?? null);
    setUserEmail(ctxUser?.email ?? null);
    setUserDisplayName(ctxProfile?.display_name ?? null);
    setUserAvatar(ctxProfile?.avatar_url ?? null);
  }, [ctxUser?.id, ctxUser?.email, ctxProfile?.display_name, ctxProfile?.avatar_url]);

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
      setPlaceNotFound(false);
      // Step 1: load the place itself. Everything else depends on `placeData`
      // existing; missing/deleted places render a real 404-like state.
      const { data: placeData, error: pErr } = await supabase
        .from("places")
        .select("id, title, description, address, city, city_id, city_name_cached, country, cover_url, photo_urls, video_url, categories, tags, link, phone, website, instagram, youtube, telegram, created_by, created_at, lat, lng, access_level, visibility, google_place_id, comments_enabled, kind, price_amount, price_currency, price_unit, duration_minutes, schedule, host_qualification, service_mode, max_guests, min_guests, meeting_point, cancellation_policy, included_items, bring_items")
        .eq("id", id)
        .single();

      if (pErr || !placeData) {
        console.error("Failed to load place:", pErr?.message || "Place not found", { id });
        setPlace(null);
        setPlaceNotFound(true);
        return;
      }
      const placeItem = placeData as Place;
      setPlace(placeItem);
      saveToRecentlyViewed(id);
      setCommentsLoading(true);

      // Step 2: fan out independent queries in parallel.
      // Previously these were sequential — each waited ~150ms RTT to Supabase,
      // so the page took ~750ms+ on top of the place fetch before showing
      // comments / counts / collections / creator / photos. Promise.all
      // collapses that to one round-trip's worth of latency.
      const [
        pcRes,
        creatorRes,
        commentRes,
        favoritesCountRes,
        commentsCountRes,
        photosRes,
      ] = await Promise.all([
        supabase
          .from("place_collections")
          .select("collection_id")
          .eq("place_id", id),
        placeItem.created_by
          ? supabase
              .from("profiles")
              .select("display_name, username, avatar_url")
              .eq("id", placeItem.created_by)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("comments")
          .select("id,text,rating,created_at,user_id")
          .eq("place_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("reactions")
          .select("id", { count: 'exact', head: true })
          .eq("place_id", id)
          .eq("reaction", "like"),
        supabase
          .from("comments")
          .select("id", { count: 'exact', head: true })
          .eq("place_id", id),
        // Photos for the gallery were previously fetched in a separate useEffect
        // that waited for `place` to be set first — adding ~150ms before the
        // gallery could render. Pulled into the parallel batch.
        supabase
          .from("place_photos")
          .select("url")
          .eq("place_id", id)
          .order("sort", { ascending: true }),
      ]);

      // Process photos immediately (so the gallery doesn't wait on the
      // dependent comment-profile lookup that runs further down).
      if (!photosRes.error && photosRes.data && photosRes.data.length > 0) {
        const urls = filterValidPhotos((photosRes.data as { url: string }[]).map(p => p.url));
        setLoadedPhotos(urls);
      } else {
        const photos: string[] = [];
        if (placeItem.photo_urls && Array.isArray(placeItem.photo_urls) && placeItem.photo_urls.length > 0) {
          photos.push(...placeItem.photo_urls.filter((url): url is string => typeof url === "string" && url.length > 0));
        } else if (placeItem.cover_url) {
          photos.push(placeItem.cover_url);
        }
        setLoadedPhotos(filterValidPhotos(photos));
      }

      // Process collections (depends on pcRes only).
      const pcData = (pcRes.data ?? []) as { collection_id: string }[];
      const collectionIds = pcRes.error ? [] : pcData.map((r) => r.collection_id).filter(Boolean);
      if (collectionIds.length > 0) {
        const { data: colData } = await supabase
          .from("collections")
          .select("id, title, description, cover_image, access_type")
          .in("id", collectionIds)
          .eq("is_active", true);
        setPlaceCollections((colData ?? []) as { id: string; title: string; description: string | null; cover_image: string | null; access_type: string }[]);
      } else {
        setPlaceCollections([]);
      }

      // Process creator profile.
      if (placeItem.created_by) {
        const profileData = creatorRes.data as ProfileData | null;
        const profileError = creatorRes.error as ErrorLike | null;
        if (profileError) {
          const msg = String(profileError.message ?? "").trim();
          const code = String(profileError.code ?? "").trim();
          if (msg || code) {
            console.error("Error loading creator profile:", [msg, code].filter(Boolean).join(" ") || "Unknown error");
          }
        }
        setCreatorProfile({
          display_name: profileData?.display_name ?? null,
          username: profileData?.username ?? null,
          avatar_url: profileData?.avatar_url ?? null,
        });
      }

      // Set counts immediately (don't wait for commenter profile lookups).
      setFavoritesCount(favoritesCountRes.count || 0);
      setCommentsCount(commentsCountRes.count || 0);

      // Process comments + commenter profiles (last query depends on comments).
      const { data: commentData, error: commentErr } = commentRes;
      if (commentErr) {
        console.error("Error loading comments:", commentErr);
        setCommentError("Failed to load comments. Please refresh the page.");
      } else {
        const loadedComments = (commentData ?? []) as CommentData[];
        const userIds = Array.from(new Set(loadedComments.map((c) => c.user_id)));
        const profilesMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();

        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", userIds);

          ((profilesData ?? []) as CommentProfileRow[]).forEach((p) => {
            profilesMap.set(p.id, {
              display_name: p.display_name,
              username: p.username,
              avatar_url: p.avatar_url,
            });
          });
        }

        const commentsWithProfiles: Comment[] = loadedComments.map((c) => {
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

        // Aggregate rating: avg + count по уже подгруженным комментам.
        // Игнорируем legacy comments без rating.
        const rated = commentsWithProfiles.filter((c) => typeof c.rating === "number");
        if (rated.length > 0) {
          const sum = rated.reduce((s, c) => s + (c.rating ?? 0), 0);
          setPlaceRating({
            avg: Math.round((sum / rated.length) * 100) / 100,
            count: rated.length,
          });
        } else {
          setPlaceRating({ avg: 0, count: 0 });
        }
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
          // Only log meaningful errors (not empty objects or expected cases)
          if (error.message || error.code || Object.keys(error).length > 0) {
            console.error("Error checking favorite status:", error);
          }
          return;
        }

        setIsFavorite(!!data);
      } catch (err) {
        // Only log meaningful errors
        if (err instanceof Error) {
          console.error("Exception checking favorite status:", err);
        } else if (typeof err === 'object' && err !== null) {
          const errorObj = err as Record<string, unknown>;
          const hasErrorContent = errorObj.message || errorObj.code || errorObj.details;
          const hasKeys = Object.keys(errorObj).length > 0;
          if (hasErrorContent || (hasKeys && !(errorObj.message === undefined && errorObj.code === undefined))) {
            console.error("Exception checking favorite status:", err);
          }
        }
      }
    })();
  }, [id, userId]);

  async function toggleFavorite() {
    if (!userId || !id) {
      redirectToAuth("place_toggle_favorite");
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
            } as never);

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
        showNotice("Link copied to clipboard");
      }
    } catch (err) {
      // Пользователь отменил или произошла ошибка
      if ((err as Error).name !== "AbortError") {
        // Fallback: копируем в буфер обмена
        try {
          await navigator.clipboard.writeText(shareUrl);
          showNotice("Link copied to clipboard");
        } catch (clipboardErr) {
          console.error("Failed to copy:", clipboardErr);
          showNotice("Could not copy the link. Please try again.", "error");
        }
      }
    }
  }

  /**
   * Open Google Maps with proper place card.
   * If google_place_id exists — uses it directly.
   * Otherwise resolves via API, saves to DB, then opens.
   * Falls back to coordinates if resolution fails.
   */
  const [resolvingPlaceId, setResolvingPlaceId] = useState(false);

  const getGoogleMapsFallbackUrl = (targetPlace: Place) => {
    if (targetPlace.lat && targetPlace.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${targetPlace.lat},${targetPlace.lng}`;
    }
    if (targetPlace.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetPlace.address)}`;
    }
    return null;
  };

  const handleOpenGoogleMaps = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!place) return;

    const fallbackUrl = getGoogleMapsFallbackUrl(place);

    // Already have google_place_id — open immediately
    if (place.google_place_id) {
      window.open(
        `https://www.google.com/maps/place/?q=place_id:${place.google_place_id}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    // No coordinates and no place_id — use address fallback
    if (!place.lat || !place.lng) {
      if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // Try to resolve google_place_id via API
    setResolvingPlaceId(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        // Not authenticated — fallback to coordinates
        if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const res = await fetch("/api/places/resolve-place-id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ placeId: place.id }),
      });

      const data = await res.json();

      if (data.google_place_id) {
        // Update local state so subsequent clicks are instant
        setPlace((prev) =>
          prev ? { ...prev, google_place_id: data.google_place_id } : prev,
        );
        window.open(
          `https://www.google.com/maps/place/?q=place_id:${data.google_place_id}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
    } catch (err) {
      console.error("[handleOpenGoogleMaps] Resolution failed:", err);
    } finally {
      setResolvingPlaceId(false);
    }

    // Fallback to coordinates
    if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener,noreferrer");
  };

  async function addComment() {
    if (!place || !commentText.trim() || sending) return;

    // Check if comments are enabled (default to enabled if null/undefined)
    if (place.comments_enabled === false) {
      setCommentError("Comments are disabled for this place.");
      return;
    }

    setSending(true);
    setCommentError(null);
    
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      
      if (authError || !auth.user) {
        setSending(false);
        setCommentError("You need to sign in to post comments.");
        setTimeout(() => {
          redirectToAuth("place_comment_auth_required");
        }, 2000);
        return;
      }

      const user = auth.user;
      
      if (!user || !user.id) {
        setSending(false);
        setCommentError("User ID is missing. Please sign in again.");
        setTimeout(() => {
          redirectToAuth("place_comment_user_missing");
        }, 2000);
        return;
      }

      const trimmedText = commentText.trim();

      if (!trimmedText) {
        setSending(false);
        return;
      }

      // Если юзер поставил звёздочки — сохраняем как rating;
      // legacy «просто комментарий без оценки» — rating остаётся null.
      const ratingToSave = commentRating > 0 ? commentRating : null;

      const { data, error } = await supabase
        .from("comments")
        .insert({
          place_id: place.id,
          user_id: user.id,
          text: trimmedText,
          rating: ratingToSave,
        } as never)
        .select("id,text,rating,created_at,user_id")
        .single() as unknown as { data: CommentData | null; error: ErrorLike | null };

      setSending(false);
      
      if (error) {
        console.error("Error adding comment:", error);
        setCommentError(error.message || "Failed to post comment. Please try again.");
        return;
      }
      
      if (data) {
        const profileResult = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", user.id)
          .single() as unknown as { data: ProfileData | null; error: ErrorLike | null };
        
        const profileData = profileResult.data;

        const newComment: Comment = {
          ...data,
          user_display_name: profileData?.display_name ?? null,
          user_username: profileData?.username ?? null,
          user_avatar_url: profileData?.avatar_url ?? null,
        };

        setComments((prev) => [newComment, ...prev]);
        setCommentsCount((prev) => prev + 1);
        setCommentText("");
        setCommentRating(0);
        setCommentError(null);

        // Пересчитать aggregate если был rating
        if (ratingToSave) {
          setPlaceRating((prev) => {
            const newCount = prev.count + 1;
            const newAvg =
              (prev.avg * prev.count + ratingToSave) / newCount;
            return { avg: Math.round(newAvg * 100) / 100, count: newCount };
          });
        }
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
        setCommentToDeleteId(null);
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
    let count = 0;
    if (selectedCity) count++;
    if (searchValue) count++;
    if (activeFilters.categories?.length) count += activeFilters.categories.length;
    if ((activeFilters.kinds ?? []).length > 0) count += (activeFilters.kinds ?? []).length;
    if ((activeFilters.tags ?? []).length > 0) count += (activeFilters.tags ?? []).length;
    if (activeFilters.sort) count++;
    return count;
  }, [activeFilters, searchValue, selectedCity]);

  // Handle filters
  const handleFiltersClick = () => {
    setFilterOpen(true);
  };

  const handleFiltersApply = (filters: ActiveFilters) => {
    setActiveFilters(filters);
    // Redirect to map page with filters
    const params = new URLSearchParams();
    if (filters.categories.length > 0) {
      params.set("categories", filters.categories.join(','));
    }
    if ((filters.tags ?? []).length > 0) {
      params.set("tags", (filters.tags ?? []).join(','));
    }
    // С 2026-05-08: kinds прокидываются в /map. См. docs/FILTERS_UNIFICATION_PLAN.md
    if (filters.kinds && filters.kinds.length > 0) {
      params.set("kinds", filters.kinds.join(","));
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

  // Auto-open PremiumUpsellModal when landing on a locked premium place.
  // Why: было «заблокировано без выхода». Теперь сразу показываем модалку
  // покупки поверх blur-страницы (см. /id/[id]/page.tsx isLocked branch).
  const autoOpenedLockedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLocked || !place) return;
    if (autoOpenedLockedRef.current === place.id) return;
    autoOpenedLockedRef.current = place.id;
    const num = getPseudoPlaceNumber(place.id);
    const pseudoTitle =
      place.kind === "service"    ? `Locked Service #${num}` :
      place.kind === "experience" ? `Locked Experience #${num}` :
                                    `Haunted Gem #${num}`;
    openPremiumModal("place", pseudoTitle, place.id);
  }, [isLocked, place, openPremiumModal]);

  if (placeNotFound) {
    return (
      <SectionErrorBoundary>
        <ErrorPage
          statusCode={404}
          title="Place not found"
          message="This place may have been deleted or the link is no longer valid."
        />
      </SectionErrorBoundary>
    );
  }

  if (!place || accessLoading) {
    return (
      <SectionErrorBoundary>
        <main className="min-h-screen bg-white">
          {/* Header skeleton */}
          <div className="sticky top-0 z-40 bg-white border-b border-[#ECEEE4]">
            <div className="h-16 flex items-center justify-between px-4">
              <div className="h-6 w-6 rounded-full bg-[#ECEEE4] animate-pulse" />
              <div className="h-6 w-24 bg-[#ECEEE4] rounded animate-pulse" />
              <div className="h-6 w-6 rounded-full bg-[#ECEEE4] animate-pulse" />
            </div>
          </div>

          {/* Image skeleton */}
          <div className="relative w-full" style={{ paddingBottom: '66.67%' }}>
            <div className="absolute inset-0 bg-[#ECEEE4] animate-pulse" />
          </div>

          {/* Content skeleton */}
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
            <div className="h-8 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-4 w-full bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </main>
      </SectionErrorBoundary>
    );
  }

  if (isLocked) {
    // pseudo-title зависит от kind: для location у нас исторически
    // «Haunted Gem», для service/experience — нейтральнее.
    const num = getPseudoPlaceNumber(place.id);
    const pseudoTitle =
      place.kind === "service"   ? `Locked Service #${num}` :
      place.kind === "experience"? `Locked Experience #${num}` :
                                   `Haunted Gem #${num}`;
    return (
      <SectionErrorBoundary>
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
                onUpgradeClick={() => openPremiumModal("place", pseudoTitle, place.id)}
              />
            </div>
          </div>
        </main>
      </SectionErrorBoundary>
    );
  }

  // ── KIND ROUTER ──────────────────────────────────────────────
  // Для service / experience рендерим отдельный шаблон в стиле Airbnb.
  // Локации продолжают использовать огромный legacy-вью ниже.
  if (place.kind === "service" || place.kind === "experience") {
    return (
      <SectionErrorBoundary>
        <OfferPlaceView
          place={place}
          kind={place.kind}
          canEdit={canEdit}
          userAvatar={userAvatar}
          userDisplayName={userDisplayName}
          userEmail={userEmail}
          isFavorite={isFavorite}
          favoriteLoading={favoriteLoading}
          onToggleFavorite={toggleFavorite}
          hostProfile={creatorProfile}
          photos={allPhotos}
        />
      </SectionErrorBoundary>
    );
  }
  // ─────────────────────────────────────────────────────────────

  return (
    <SectionErrorBoundary>
    <main className="min-h-screen bg-white">
      <TransientNotice
        message={notice?.message ?? null}
        variant={notice?.variant}
        onDismiss={() => setNotice(null)}
      />
      <ConfirmDialog
        open={commentToDeleteId !== null}
        title="Delete comment?"
        description="This removes your comment from this place. This action cannot be undone."
        confirmLabel="Delete"
        loading={commentToDeleteId !== null && deletingCommentId === commentToDeleteId}
        onClose={() => {
          if (!deletingCommentId) setCommentToDeleteId(null);
        }}
        onConfirm={() => {
          if (commentToDeleteId) void deleteComment(commentToDeleteId);
        }}
      />
      {/* TopBar - скрыт на мобильных (< 900px), так как есть Mobile App Bar внутри карусели */}
      <div className="hidden lg:block">
        <TopBar
          showSearchBar={true}
          searchValue={searchValue}
          onSearchChange={(value) => {
            setSearchValue(value);
            const params = new URLSearchParams();
            if (selectedCity) params.set("city", selectedCity);
            if (value.trim()) params.set("q", value.trim());
            if (activeFilters.categories.length > 0) {
              params.set("categories", activeFilters.categories.join(','));
            }
            router.push(`/map?${params.toString()}`);
          }}
          selectedCity={selectedCity}
          onCityChange={(city) => {
            setSelectedCity(city);
            const params = new URLSearchParams();
            if (city && city.trim()) {
              params.set("city", city.trim());
            }
            if (searchValue && searchValue.trim()) {
              params.set("q", searchValue.trim());
            }
            if (activeFilters.categories.length > 0) {
              params.set("categories", activeFilters.categories.join(','));
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
          onSearchBarClick={() => setSearchModalOpen(true)}
        />
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={(city) => {
          setSelectedCity(city);
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", city.trim());
          }
          if (searchValue && searchValue.trim()) {
            params.set("q", searchValue.trim());
          }
          if (activeFilters.categories.length > 0) {
            params.set("categories", activeFilters.categories.join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        onSearchSubmit={(city, query, tags, kind) => {
          setSelectedCity(city);
          setSearchValue(query);
          if (tags) {
            setSelectedTags(tags);
            setActiveFilters(prev => ({
              ...prev,
              categories: tags,
            }));
          }
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", city.trim());
          }
          if (query.trim()) {
            params.set("q", query.trim());
          }
          const categoriesToUse = tags || activeFilters.categories;
          if (categoriesToUse.length > 0) {
            params.set("categories", categoriesToUse.join(','));
          }
          if (kind) {
            params.set("kinds", kind);
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCity}
        searchQuery={searchValue}
        selectedTags={selectedTags}
      />


      {/* Title Row - Desktop (>= 1120px): Before gallery */}
      <div className="hidden lg:block pt-[80px]">
        <div className="max-w-[1280px] lg:max-w-[1120px] lg:max-w-[1280px] mx-auto px-6">
          <div className="flex items-center justify-between gap-4 mb-6 pt-12">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <h1 className="font-fraunces text-2xl font-semibold text-[#1F2A1F]">{place.title}</h1>
              {isPremium && (
                <div className="flex items-center gap-2">
                  <PremiumBadge />
                  {/* Show pseudo title badge for owner to see what others see */}
                  {isOwner && (
                    <div className="px-3 py-1.5 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] text-[#6F7A5A] text-xs font-medium badge-shadow">
                      {`Haunted Gem #${getPseudoPlaceNumber(place.id)}`}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEdit && (
                <button
                  onClick={() => router.push(`/places/${id}/edit`)}
                  className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-[#1F2A1F]"
                  aria-label="Edit place"
                >
                  <Icon name="edit" size={16} />
                  Edit
                </button>
              )}
              <button
                onClick={handleShare}
                className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-[#1F2A1F]"
                aria-label="Share"
              >
                <Icon name="share" size={16} />
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
                <AuthCTA
                  variant="sign-in"
                  appearance="secondary"
                  trigger="place_favorites_hero"
                  className="gap-2"
                >
                  <FavoriteIcon isActive={false} size={16} />
                  Add to favorites
                </AuthCTA>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Photo Gallery - Responsive */}
      {/* Desktop: Airbnb-style mosaic gallery (>= 900px) - 2:1 aspect ratio */}
      <div ref={heroRef} className="hidden lg:block mb-6">
        <div className="max-w-[1280px] lg:max-w-[1120px] lg:max-w-[1280px] mx-auto px-6 lg:px-6 lg:px-6">
          <DesktopMosaic
            photos={allPhotos}
            title={place.title}
            gap={PLACE_LAYOUT_CONFIG.desktopXL.galleryGap}
            radius={PLACE_LAYOUT_CONFIG.desktopXL.galleryRadius}
            onShowAll={() => {
              // Open photo gallery starting from the first photo not visible in mosaic (index 5)
              const startIndex = allPhotos.length > 5 ? 5 : 0;
              setGalleryPhotoIndex(startIndex);
              setIsImageTransitioning(false);
              setPhotoGalleryOpen(true);
              setPhotoZoom(1);
              setPhotoPosition({ x: 0, y: 0 });
            }}
            onPhotoClick={(index) => {
              setGalleryPhotoIndex(index);
              setIsImageTransitioning(false);
              setPhotoGalleryOpen(true);
              setPhotoZoom(1);
              setPhotoPosition({ x: 0, y: 0 });
            }}
          />
        </div>
      </div>

      {/* Mobile: Full-bleed carousel (< 900px) */}
      <div className="lg:hidden relative">
        <MobileCarousel
          photos={allPhotos}
          title={place.title}
          height={PLACE_LAYOUT_CONFIG.mobile.galleryHeight}
          onShowAll={() => {
            // Open photo gallery starting from the first photo
            setGalleryPhotoIndex(0);
            setIsImageTransitioning(false);
            setPhotoGalleryOpen(true);
            setPhotoZoom(1);
            setPhotoPosition({ x: 0, y: 0 });
          }}
          onPhotoClick={(index) => {
            setGalleryPhotoIndex(index);
            setPhotoGalleryOpen(true);
            setPhotoZoom(1);
            setPhotoPosition({ x: 0, y: 0 });
          }}
        />
        
        {/* Mobile App Bar - Back, Share, Heart */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 pt-safe-top">
          <button
            onClick={() => router.back()}
            className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#1F2A1F] hover:bg-white transition-colors"
            aria-label="Back"
          >
            <Icon name="back" size={20} />
          </button>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => router.push(`/places/${id}/edit`)}
                className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#1F2A1F] hover:bg-white transition-colors"
                aria-label="Edit place"
              >
                <Icon name="edit" size={20} />
              </button>
            )}
            {userId && (
              <button
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                className={cx(
                  "h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center transition-colors",
                  favoriteLoading && "opacity-50"
                )}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <FavoriteIcon 
                  isActive={isFavorite} 
                  size={20}
                />
              </button>
            )}
            <button
              onClick={handleShare}
              className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#1F2A1F] hover:bg-white transition-colors"
              aria-label="Share"
            >
              <Icon name="share" size={20} />
            </button>
          </div>
        </div>
      </div>


      {/* Mobile/Tablet: Bottom sheet with title (mobile only) */}
      <div className="lg:hidden">
        <div className="bg-white rounded-t-[24px] -mt-8 relative z-10 px-6 pt-12 pb-0">
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-fraunces text-2xl font-semibold text-[#1F2A1F] mb-0 line-clamp-2 text-center">{place.title}</h1>
            {isPremium && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <PremiumBadge />
                {/* Show pseudo title badge for owner to see what others see */}
                {isOwner && (
                  <div className="px-3 py-1.5 rounded-lg bg-[#FAFAF7] border border-[#ECEEE4] text-[#6F7A5A] text-xs font-medium">
                    {`Haunted Gem #${getPseudoPlaceNumber(place.id)}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Sections - Responsive Layout */}
      {/* Desktop: 2 columns (Content + Sticky Booking) >= 1120px */}
      <div className="hidden lg:flex max-w-[1280px] lg:max-w-[1120px] lg:max-w-[1280px] mx-auto px-6 py-8 gap-8">
        {/* Left: Content (58-64%) */}
        <div className="w-[62%] lg:w-[60%]">
          {/* City and Address */}
          <div className="mb-6">
          {place.city && (
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">{place.city}</h2>
          )}
          {place.address && (
            <div className="mb-4">
              <a
                href={getGoogleMapsFallbackUrl(place) ?? "#"}
                onClick={handleOpenGoogleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base text-[#8F9E4F]/70 hover:text-[#8F9E4F] hover:underline transition cursor-pointer"
                aria-label="Open address in Google Maps"
                tabIndex={0}
              >
                {place.address}
              </a>
            </div>
          )}

        </div>

        {/* Statistics Block */}
        <div className="rounded-xl bg-[#FAFAF7] border border-[#ECEEE4] p-6 mb-6">
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
                <Icon name="comment" size={24} className="text-[#8F9E4F]" />
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
              <Image
                src={creatorProfile.avatar_url}
                alt={creatorName}
                width={56}
                height={56}
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

        {/* Host page: experiences/services прицеплённые к этой локации через place_links */}
        {place.kind === "location" && (
          <LocationChildrenSection parentId={place.id} canEdit={canEdit} />
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className="pb-6 mb-6 border-b border-[#ECEEE4]">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/?category=${encodeURIComponent(cat)}`}
                  className="px-3 py-1.5 rounded-full text-sm font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition"
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
                    className="mt-4 w-full max-lg:w-full lg:w-auto lg:inline-block h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors text-base font-medium text-[#1F2A1F]"
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
                    className="px-3 py-1.5 rounded-full text-base text-[#8F9E4F] bg-[#FAFAF7] border border-[#6b7d47]/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {placeCollections.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F] mb-3">In collections</h3>
              <div className="space-y-4">
                {placeCollections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/collections/${c.id}`}
                    className="group flex rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden shadow-sm hover:shadow-md transition"
                  >
                    <div className="w-32 sm:w-40 flex-shrink-0 aspect-square bg-[#ECEEE4] relative overflow-hidden">
                      {c.cover_image ? (
                        <Image
                          src={c.cover_image}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 160px, 128px"
                          className="object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#A8B096]">
                          <Icon name="photo" size={32} />
                        </div>
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${c.access_type === "premium" ? "bg-[#8F9E4F] text-white" : "bg-white/90 text-[#6F7A5A]"}`}>
                          {c.access_type === "premium" ? "Premium" : "Free"}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
                      <h4 className="font-fraunces font-semibold text-[#1F2A1F] text-base mb-1 group-hover:text-[#8F9E4F] transition">{c.title}</h4>
                      {c.description && (
                        <p className="text-sm text-[#6F7A5A] line-clamp-2">{c.description}</p>
                      )}
                    </div>
                  </Link>
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
                    className="relative aspect-square rounded-xl overflow-hidden bg-[#FAFAF7] group"
                  >
                    <Image
                      src={photo}
                      alt={`${place.title} - Photo ${index + 1}`}
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
              {allPhotos.length > 4 && !photosExpanded && (
                <button
                  onClick={() => setPhotosExpanded(true)}
                  className="mt-4 w-full py-3 rounded-xl border border-[#ECEEE4] text-[#8F9E4F] font-medium hover:bg-[#FAFAF7] transition"
                >
                  Show all {allPhotos.length} photos
                </button>
              )}
            </>
          )}
        </section>

        {/* Video Section */}
        {place.video_url && (() => {
          const embedUrl = convertInstagramReelToEmbed(place.video_url);
          if (!embedUrl) return null;

          // Crop Instagram embed UI (best-effort)
          const CROP_TOP_PX = 56;
          const CROP_BOTTOM_PX = 160;
          
          return (
            <section className="mb-16">
              <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Video</h2>
              <div className="w-full max-w-full">
                <div 
                  className="relative w-full rounded-xl overflow-hidden bg-[#FAFAF7] border border-[#ECEEE4]"
                  style={{ 
                    aspectRatio: '9/16',
                    maxWidth: '100%'
                  }}
                >
                  {/* Covers to hide Instagram chrome (top/bottom UI) */}
                  <div
                    className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
                    style={{
                      height: `${CROP_TOP_PX}px`,
                      background:
                        "linear-gradient(to bottom, rgba(250, 250, 247, 1) 70%, rgba(250, 250, 247, 0) 100%)",
                    }}
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
                    style={{
                      height: `${CROP_BOTTOM_PX}px`,
                      background:
                        "linear-gradient(to top, rgba(250, 250, 247, 1) 70%, rgba(250, 250, 247, 0) 100%)",
                    }}
                  />
                  <iframe
                    src={embedUrl}
                    title={`Instagram Reel for ${place.title}`}
                    className="absolute inset-0 w-full h-full"
                    frameBorder="0"
                    scrolling="no"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                    style={{
                      marginTop: `-${CROP_TOP_PX}px`,
                      marginBottom: `-${CROP_BOTTOM_PX}px`,
                      height: `calc(100% + ${CROP_TOP_PX + CROP_BOTTOM_PX}px)`,
                      pointerEvents: 'auto',
                    }}
                  />
                </div>
              </div>
            </section>
          );
        })()}

        {/* Map Section */}
        <section ref={mapRef} id="map" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-6">Location</h2>
          {place.lat && place.lng ? (
            <div className="space-y-4">
              <div className="h-[400px] lg:h-[500px] rounded-xl overflow-hidden bg-[#FAFAF7]">
                <PlaceMapView place={place} onMarkerClick={() => handleOpenGoogleMaps()} />
              </div>
              <button
                onClick={handleOpenGoogleMaps}
                disabled={resolvingPlaceId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#8F9E4F] text-sm font-medium hover:bg-[#FAFAF7] transition lg:inline-flex max-lg:w-full max-lg:py-3 max-lg:border-[#ECEEE4] max-lg:bg-white max-lg:text-[#1F2A1F] max-lg:text-base max-lg:hover:bg-[#FAFAF7] disabled:opacity-50"
                aria-label="Open in Google Maps"
                tabIndex={0}
              >
                <Icon name="external-link" size={16} />
                {resolvingPlaceId ? "Opening…" : "Open in Maps"}
              </button>
            </div>
          ) : (
            <div className="text-center py-12 text-[#8F9E4F]/60">Location not available</div>
          )}
        </section>

        {/* Comments Section */}
        <section ref={commentsRef} id="comments" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">Reviews</h2>
          {placeRating.count > 0 && (
            <div className="flex items-center gap-2 mb-5 text-sm text-[#1F2A1F]">
              <StarRating value={placeRating.avg} size={16} />
              <span className="font-semibold">{placeRating.avg.toFixed(2)}</span>
              <span className="text-[#6F7A5A]">·</span>
              <span className="text-[#6F7A5A]">{placeRating.count} review{placeRating.count === 1 ? "" : "s"}</span>
            </div>
          )}

          {/* Check if comments are enabled (default to enabled if null/undefined) */}
          {place?.comments_enabled === false ? (
            <div className="text-center py-12 text-[#8F9E4F]/60">
              <div className="mb-1">Reviews are disabled for this place</div>
            </div>
          ) : (
            <>
          {/* Add review */}
          {userId ? (
            <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-white p-4">
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1.5">Your rating</div>
                <StarRating value={commentRating} size={28} onChange={setCommentRating} />
              </div>
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
              <AuthCTA variant="sign-in" trigger="place_comments_desktop" showToastBeforeRedirect={false}>
                Sign In
              </AuthCTA>
            </div>
          )}

          {/* Comments list */}
          {commentsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#ECEEE4] flex-shrink-0 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
                    <div className="h-4 w-full bg-[#ECEEE4] rounded animate-pulse" />
                    <div className="h-4 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
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
                        <Image
                          src={userAvatar}
                          alt={userName}
                          width={40}
                          height={40}
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
                              onClick={() => setCommentToDeleteId(c.id)}
                              disabled={deletingCommentId === c.id}
                              className="text-xs text-[#C96A5B] hover:text-[#B85A4B] disabled:opacity-50 transition flex-shrink-0"
                            >
                              {deletingCommentId === c.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                        {typeof c.rating === "number" && (
                          <div className="mb-1">
                            <StarRating value={c.rating} size={14} />
                          </div>
                        )}
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
          </>
          )}
        </section>
        </div>

        {/* Right: Sticky Actions Card (38-42%) */}
        <div className="w-[38%] lg:w-[40%] flex-shrink-0">
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
                      : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                    favoriteLoading && "opacity-50"
                  )}
                >
                  <FavoriteIcon isActive={isFavorite} size={20} />
                  {isFavorite ? "Remove from favorites" : "Add to favorites"}
                </button>
              ) : (
                <AuthCTA
                  variant="sign-in"
                  appearance="secondary"
                  trigger="place_favorites_sidebar"
                  className="w-full gap-2 font-medium"
                >
                  <FavoriteIcon isActive={false} size={20} />
                  Add to favorites
                </AuthCTA>
              )}

              {/* Show on Map (Google Link) */}
              {place.lat && place.lng && (
                <button
                  onClick={handleOpenGoogleMaps}
                  disabled={resolvingPlaceId}
                  className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium disabled:opacity-50"
                  aria-label="Show on Google Maps"
                  tabIndex={0}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {resolvingPlaceId ? "Opening…" : "Show on map"}
                </button>
              )}

              {/* Share */}
              <button
                onClick={handleShare}
                className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium"
              >
                <Icon name="share" size={20} />
                Share
              </button>

              {/* Contacts (desktop sidebar) — скрывается полностью если все поля пустые */}
              <PlaceContacts
                phone={place.phone}
                website={place.website}
                instagram={place.instagram}
                youtube={place.youtube}
                telegram={place.telegram}
                title="Contact"
                variant="card"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tablet/Mobile: Single column layout (< 1120px) */}
      <div className="lg:hidden pb-24 lg:pb-8">
        <div className="max-w-full mx-auto px-6 lg:px-5 lg:px-6 max-lg:pt-4 lg:pt-8 pb-8">
          {/* City and Address */}
          <div className="mb-6 max-lg:text-center lg:text-left">
            {place.city && (
              <h2 className="text-sm font-medium text-[#1F2A1F] mb-2">{place.city}</h2>
            )}
            {place.address && (
              <div className="mb-4">
                <a
                  href={getGoogleMapsFallbackUrl(place) ?? "#"}
                  onClick={handleOpenGoogleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-[#8F9E4F]/70 hover:text-[#8F9E4F] hover:underline transition cursor-pointer"
                  aria-label="Open address in Google Maps"
                  tabIndex={0}
                >
                  {place.address}
                </a>
              </div>
            )}
          </div>

          {/* Statistics Block */}
          <div className="rounded-xl bg-[#FAFAF7] border border-[#ECEEE4] p-4 mb-6">
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
            <div className="flex items-center gap-3 pb-6 mb-6 border-b border-[#ECEEE4]">
              {creatorProfile.avatar_url ? (
                <Image
                  src={creatorProfile.avatar_url}
                  alt={creatorName}
                  width={48}
                  height={48}
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

          {/* Host page: experiences/services прицеплённые к этой локации через place_links */}
          {place.kind === "location" && (
            <LocationChildrenSection parentId={place.id} canEdit={canEdit} />
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

          {/* Contacts (mobile/tablet) — обёртка только если хотя бы одно поле заполнено */}
          {(place.phone || place.website || place.instagram || place.youtube || place.telegram) && (
            <div className="pb-6 mb-6 border-b border-[#ECEEE4]">
              <PlaceContacts
                phone={place.phone}
                website={place.website}
                instagram={place.instagram}
                youtube={place.youtube}
                telegram={place.telegram}
                title="Contact"
                variant="inline"
              />
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
                      className="mt-3 text-base font-medium text-[#1F2A1F] hover:underline lg:block max-lg:hidden"
                    >
                      Show more
                    </button>
                    {/* Mobile: Show more button with border */}
                    <button
                      onClick={() => setShowDescriptionModal(true)}
                      className="mt-4 w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors text-base font-medium text-[#1F2A1F] lg:hidden"
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
                      className="px-3 py-1.5 rounded-full text-base text-[#8F9E4F] bg-[#FAFAF7] border border-[#6b7d47]/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {placeCollections.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-3">In collections</h3>
                <div className="space-y-4">
                  {placeCollections.map((c) => (
                    <Link
                      key={c.id}
                      href={`/collections/${c.id}`}
                      className="group flex rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden shadow-sm hover:shadow-md transition"
                    >
                      <div className="w-28 sm:w-36 flex-shrink-0 aspect-square bg-[#ECEEE4] relative overflow-hidden">
                        {c.cover_image ? (
                          <Image
                            src={c.cover_image}
                            alt=""
                            fill
                            sizes="(min-width: 640px) 144px, 112px"
                            className="object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#A8B096]">
                            <Icon name="photo" size={24} />
                          </div>
                        )}
                        <div className="absolute top-1.5 right-1.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${c.access_type === "premium" ? "bg-[#8F9E4F] text-white" : "bg-white/90 text-[#6F7A5A]"}`}>
                            {c.access_type === "premium" ? "Premium" : "Free"}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
                        <h4 className="font-fraunces font-semibold text-[#1F2A1F] text-base mb-1 group-hover:text-[#8F9E4F] transition">{c.title}</h4>
                        {c.description && (
                          <p className="text-sm text-[#6F7A5A] line-clamp-2">{c.description}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Actions Card - Below content on tablet/mobile */}
          <div className="mb-16 max-w-[720px] lg:max-w-full mx-auto">
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
                        : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                      favoriteLoading && "opacity-50"
                    )}
                  >
                    <FavoriteIcon isActive={isFavorite} size={20} />
                    {isFavorite ? "Remove from favorites" : "Add to favorites"}
                  </button>
                ) : (
                  <AuthCTA
                    variant="sign-in"
                    appearance="secondary"
                    trigger="place_favorites_mobile"
                    className="w-full gap-2 font-medium"
                  >
                    <FavoriteIcon isActive={false} size={20} />
                    Add to favorites
                  </AuthCTA>
                )}

                {/* Show on Map (Google Link) */}
                {place.lat && place.lng && (
                  <button
                    onClick={handleOpenGoogleMaps}
                    disabled={resolvingPlaceId}
                    className="w-full h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 text-[#1F2A1F] font-medium disabled:opacity-50"
                    aria-label="Show on Google Maps"
                    tabIndex={0}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {resolvingPlaceId ? "Opening…" : "Show on map"}
                  </button>
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
                    className="relative aspect-square rounded-xl overflow-hidden bg-[#FAFAF7] group"
                  >
                    <Image
                      src={photo}
                      alt={`${place.title} - Photo ${index + 1}`}
                      fill
                      sizes="(min-width: 1024px) 33vw, 50vw"
                      className="object-cover"
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
                  <PlaceMapView place={place} onMarkerClick={() => handleOpenGoogleMaps()} />
                </div>
                <button
                  onClick={handleOpenGoogleMaps}
                  disabled={resolvingPlaceId}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#8F9E4F] text-sm font-medium hover:bg-[#FAFAF7] transition lg:inline-flex max-lg:w-full max-lg:py-3 max-lg:border-[#ECEEE4] max-lg:bg-white max-lg:text-[#1F2A1F] max-lg:text-base max-lg:hover:bg-[#FAFAF7] disabled:opacity-50"
                  aria-label="Open in Google Maps"
                  tabIndex={0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {resolvingPlaceId ? "Opening…" : "Open in Maps"}
                </button>
              </div>
            ) : (
              <div className="text-center py-12 text-[#8F9E4F]/60">Location not available</div>
            )}
          </section>

          <section ref={commentsRef} id="comments" className="mb-16">
            <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">Reviews</h2>
            {placeRating.count > 0 && (
              <div className="flex items-center gap-2 mb-5 text-sm text-[#1F2A1F]">
                <StarRating value={placeRating.avg} size={16} />
                <span className="font-semibold">{placeRating.avg.toFixed(2)}</span>
                <span className="text-[#6F7A5A]">·</span>
                <span className="text-[#6F7A5A]">{placeRating.count} review{placeRating.count === 1 ? "" : "s"}</span>
              </div>
            )}
            {/* Check if comments are enabled (default to enabled if null/undefined) */}
            {place?.comments_enabled === false ? (
              <div className="text-center py-12 text-[#8F9E4F]/60">
                <div className="mb-1">Reviews are disabled for this place</div>
              </div>
            ) : (
              <>
            {userId ? (
              <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-white p-4">
                <div className="mb-3">
                  <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1.5">Your rating</div>
                  <StarRating value={commentRating} size={28} onChange={setCommentRating} />
                </div>
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
                <AuthCTA variant="sign-in" trigger="place_comments_mobile" showToastBeforeRedirect={false}>
                  Sign In
                </AuthCTA>
              </div>
            )}

            {commentsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#ECEEE4] flex-shrink-0 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
                      <div className="h-4 w-full bg-[#ECEEE4] rounded animate-pulse" />
                      <div className="h-4 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
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
                          <Image
                            src={userAvatar}
                            alt={userName}
                            width={40}
                            height={40}
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
                                onClick={() => setCommentToDeleteId(c.id)}
                                disabled={deletingCommentId === c.id}
                                className="text-xs text-[#C96A5B] hover:text-[#B85A4B] disabled:opacity-50 transition flex-shrink-0"
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
            </>
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
        userAccess={access}
        // С 2026-05-08: TYPE-секция показывается на всех страницах.
        // На /id/[id] нет related-places-секции, которая бы фильтровалась по kind,
        // но юзер всё равно может выставить TYPE и нажать Apply — модал push'ит на
        // /map?kinds=…, где фильтр реально применяется. См. docs/FILTERS_UNIFICATION_PLAN.md.
        getFilteredCount={async (draftFilters: ActiveFilters) => {
          // Подсчитываем количество мест с учетом фильтров
          try {
            let countQuery = supabase.from("places").select("id", { count: 'exact', head: true });

            // Фильтрация по категориям
            if (draftFilters.categories.length > 0) {
              countQuery = countQuery.overlaps("categories", draftFilters.categories);
            }

            // Фильтрация по kind (TYPE) — чтобы счётчик "Show N places"
            // отражал тот же фильтр, что применится после редиректа на /map.
            if (draftFilters.kinds && draftFilters.kinds.length > 0) {
              countQuery = countQuery.in("kind", draftFilters.kinds);
            }

            const { count, error } = await countQuery;
            if (error) {
              // Silently ignore AbortError
              if (isAbortLikeError(error)) {
                return 0;
              }
              console.error("Error counting filtered places:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                categories: draftFilters.categories,
              });
              return 0;
            }
            return count || 0;
          } catch (error: unknown) {
            const err = toErrorLike(error);
            // Silently ignore AbortError
            if (isAbortLikeError(error)) {
              return 0;
            }
            console.error("Error in getFilteredCount:", {
              message: err.message,
              name: err.name,
              code: err.code,
              string: String(error),
            });
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
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 sm:p-4 pt-safe-top">
            {/* Photo counter */}
            <div className="absolute left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1.5 badge-shadow pointer-events-none">
              <span className="text-white text-sm font-medium">
                {galleryPhotoIndex + 1} / {allPhotos.length}
              </span>
            </div>

            {/* Close button */}
            <button
              type="button"
              data-gallery-control="true"
              onPointerDownCapture={handleGalleryClosePress}
              onTouchStartCapture={handleGalleryClosePress}
              onClick={handleGalleryClosePress}
              onTouchStart={stopGalleryControlTouch}
              onTouchMove={stopGalleryControlTouch}
              onTouchEnd={stopGalleryControlTouch}
              className="fixed right-3 z-[120] flex h-16 w-16 min-h-16 min-w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-colors touch-manipulation active:bg-black/70 sm:right-4 sm:h-14 sm:w-14 sm:min-h-14 sm:min-w-14 before:absolute before:content-[''] before:-inset-2 before:rounded-full"
              style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
              aria-label="Close"
            >
              <Icon name="close" size={24} className="pointer-events-none text-white" />
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
              <Image
                src={allPhotos[galleryPhotoIndex]}
                alt={`${place.title} - Photo ${galleryPhotoIndex + 1}`}
                fill
                sizes="100vw"
                className="object-contain transition-opacity duration-300 ease-in-out"
                style={{
                  opacity: isImageTransitioning ? 0 : 1,
                }}
                onDoubleClick={handlePhotoDoubleClick}
                draggable={false}
              />
            </div>
          </div>

          {/* Navigation buttons */}
          {allPhotos.length > 1 && (
            <>
              <button
                type="button"
                data-gallery-control="true"
                onClick={handlePrevPhoto}
                onTouchStart={stopGalleryControlTouch}
                onTouchMove={stopGalleryControlTouch}
                onTouchEnd={stopGalleryControlTouch}
                className="absolute left-2 sm:left-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all touch-manipulation hover:bg-black/70 active:bg-black/80"
                aria-label="Previous photo"
              >
                <Icon name="back" size={24} className="pointer-events-none text-white" />
              </button>
              <button
                type="button"
                data-gallery-control="true"
                onClick={handleNextPhoto}
                onTouchStart={stopGalleryControlTouch}
                onTouchMove={stopGalleryControlTouch}
                onTouchEnd={stopGalleryControlTouch}
                className="absolute right-2 sm:right-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all touch-manipulation hover:bg-black/70 active:bg-black/80"
                aria-label="Next photo"
              >
                <Icon name="forward" size={24} className="pointer-events-none text-white" />
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
                  closePhotoGallery();
                }
              }}
              className="pointer-events-none absolute inset-0"
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
                <Icon name="close" size={24} className="text-[#1F2A1F]" />
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
    </SectionErrorBoundary>
  );
}

// Map View Component
function PlaceMapView({ place, onMarkerClick }: { place: Place; onMarkerClick?: () => void }) {
  const shouldLoadMap = true;
  
  // SDK already initialized at app shell (see GoogleMapsProvider in RootLayout).
  // Reading from context means navigation here doesn't re-trigger the SDK
  // download — it's already on the wire (or done) by the time the user arrives.
  const { isLoaded, loadError } = useGoogleMaps();

  // All hooks must be called before any early returns
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Prevent page scroll when interacting with map on mobile
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  if (!place.lat || !place.lng) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#8F9E4F]/60">
        Location not available
      </div>
    );
  }

  // Don't render map content if lazy loading hasn't triggered yet
  if (!shouldLoadMap) {
    return <MapSkeleton className="w-full h-full" />;
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#ECEEE4] px-5 text-center">
        <div>
          <div className="mb-1 text-sm font-medium text-[#1F2A1F]">Map unavailable</div>
          <div className="text-xs text-[#6F7A5A]">Google Maps is not configured for this environment.</div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <MapSkeleton className="w-full h-full" />;
  }

  return (
    <div
      ref={mapContainerRef}
      style={{
        touchAction: 'none',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
        height: '100%',
      }}
    >
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={{ lat: place.lat, lng: place.lng }}
        zoom={15}
        options={getMapOptions({
          disableDefaultUI: false,
          zoomControl: true,
        })}
      >
        <Marker
          position={{ lat: place.lat, lng: place.lng }}
          title={place.title}
          onClick={onMarkerClick}
          cursor={onMarkerClick ? "pointer" : undefined}
          icon={{
            url: createStaticPinSvg(32),
            scaledSize: new google.maps.Size(32, 32),
            anchor: new google.maps.Point(16, 16),
          }}
        />
      </GoogleMap>
    </div>
  );
}
