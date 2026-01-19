"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../../constants";
import TopBar from "../../components/TopBar";
import BottomNav from "../../components/BottomNav";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photosExpanded, setPhotosExpanded] = useState(false);

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
    const handleScroll = () => {
      if (heroRef.current) {
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        setStickyNavVisible(heroBottom < 0);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
      const offset = 80; // Account for sticky nav
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
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", placeItem.created_by)
          .single();

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
      const { data, error } = await supabase
        .from("reactions")
        .select("id")
        .eq("place_id", id)
        .eq("user_id", userId)
        .eq("reaction", "like")
        .maybeSingle();

      if (!error) {
        setIsFavorite(!!data);
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
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setFavoriteLoading(false);
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
        onBack={() => router.back()}
        showDesktopTabs={false}
        userAvatar={null}
        userDisplayName={null}
        userEmail={null}
      />

      {/* Hero Photo Gallery */}
      <div ref={heroRef} className="relative w-full" style={{ height: "min(60vh, 600px)" }}>
        {allPhotos.length > 0 ? (
          <div className="relative w-full h-full bg-[#f5f4f2] rounded-b-3xl overflow-hidden">
            {allPhotos.length === 1 ? (
              <img
                src={allPhotos[0]}
                alt={place.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="grid grid-cols-2 h-full gap-1">
                {/* Main large photo on left */}
                <div className="relative">
                  <img
                    src={allPhotos[0]}
                    alt={place.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Grid of smaller photos on right */}
                <div className="grid grid-rows-2 gap-1">
                  {allPhotos.slice(1, 3).map((photo, index) => (
                    <div key={index} className="relative overflow-hidden">
                      <img
                        src={photo}
                        alt={`${place.title} - Photo ${index + 2}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {allPhotos.length > 3 && (
                    <button
                      onClick={() => scrollToSection("photos")}
                      className="relative bg-black/40 hover:bg-black/50 transition group"
                    >
                      <img
                        src={allPhotos[3]}
                        alt={`${place.title} - Photo 4`}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-70"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-semibold text-lg">
                          +{allPhotos.length - 3}
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Navigation buttons */}
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm z-10"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
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
              {isOwner && (
                <button
                  onClick={() => router.push(`/id/${id}/edit`)}
                  className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm"
                  aria-label="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-[#f5f4f2] flex items-center justify-center rounded-b-3xl">
            <svg className="w-16 h-16 text-[#6b7d47]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Title and Meta Section */}
      <div className="mx-auto max-w-7xl px-4 lg:px-8 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl lg:text-3xl font-semibold text-[#2d2d2d] mb-2">{place.title}</h1>
            <div className="flex items-center gap-2 text-sm text-[#6b7d47]/70 mb-3">
              {place.city && <span>{place.city}</span>}
              {place.country && place.city && <span>·</span>}
              {place.country && <span>{place.country}</span>}
            </div>
          </div>
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((cat) => (
              <Link
                key={cat}
                href={`/?category=${encodeURIComponent(cat)}`}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20 hover:bg-[#6b7d47]/5 transition"
              >
                {cat}
              </Link>
            ))}
          </div>
        )}

        {/* Added by */}
        <div className="flex items-center gap-2 text-sm text-[#6b7d47]/60">
          <span>Added by {creatorName}</span>
          <span>·</span>
          <span>{timeAgo(place.created_at)}</span>
        </div>
      </div>

      {/* Sticky Sub-Navigation */}
      <div
        className={cx(
          "sticky top-[64px] z-30 bg-white border-b border-[#6b7d47]/10 transition-all duration-200",
          stickyNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          {/* Desktop: Full-width tabs */}
          <div className="hidden lg:flex items-center gap-1">
            {(["overview", "photos", "details", "map", "comments"] as const).map((section) => (
              <button
                key={section}
                onClick={() => scrollToSection(section)}
                className={cx(
                  "px-4 py-3 text-sm font-medium transition border-b-2",
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
          <div className="lg:hidden overflow-x-auto scrollbar-hide -mx-4 px-4">
            <div className="flex items-center gap-1 min-w-max">
              {(["overview", "photos", "details", "map", "comments"] as const).map((section) => (
                <button
                  key={section}
                  onClick={() => scrollToSection(section)}
                  className={cx(
                    "px-4 py-3 text-sm font-medium transition whitespace-nowrap border-b-2",
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
        </div>
      </div>

      {/* Content Sections */}
      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-8">
        {/* Overview Section */}
        <section ref={overviewRef} id="overview" className="mb-16">
          {place.description && (
            <div className="mb-6">
              <p className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                {place.description}
              </p>
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

      <BottomNav />
    </main>
  );
}

// Map View Component
function PlaceMapView({ place }: { place: Place }) {
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["places"],
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
