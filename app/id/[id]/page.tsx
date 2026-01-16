"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../../constants";
import Pill from "../../components/Pill";

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
type CreatorProfile = { display_name: string | null; username: string | null; email: string | null };

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

  const [tab, setTab] = useState<"info" | "map" | "comments">("info");
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
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Handle back navigation intelligently
  function handleBack() {
    if (typeof window === "undefined") {
      router.push("/");
      return;
    }

    // Check if we have a referrer from our app
    const referrer = document.referrer;
    const isFromOurApp = referrer && (
      referrer.includes(window.location.origin) && 
      !referrer.includes(`/id/${id}`)
    );
    
    // If we came from our app, use browser back
    // Otherwise, navigate to home
    if (isFromOurApp) {
      router.back();
    } else {
      // If no referrer or came from outside, go to home
      router.push("/");
    }
  }

  const tags = useMemo(() => place?.tags ?? [], [place]);
  const categories = useMemo(() => place?.categories ?? [], [place]);
  const isOwner = place?.created_by === userId;
  
  // Get 1-2 vibe chips from tags (prioritize common vibe words, fallback to first tags)
  const vibeChips = useMemo(() => {
    if (tags.length === 0) return [];
    const vibeKeywords = ["quiet", "romantic", "scenic", "cozy", "hidden", "sunset", "rooftop", "beach", "nature", "vintage"];
    const matched = tags.filter(tag => 
      vibeKeywords.some(keyword => tag.toLowerCase().includes(keyword.toLowerCase()))
    );
    // If we found matches, use them; otherwise use first 2 tags
    return matched.length > 0 ? matched.slice(0, 2) : tags.slice(0, 2);
  }, [tags]);

  const [loadedPhotos, setLoadedPhotos] = useState<string[]>([]);

  // Загружаем фото из таблицы place_photos
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
        console.log("Loaded photos from place_photos:", {
          totalPhotos: urls.length,
          photos: urls
        });
      } else {
        // Fallback: используем старый формат
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

  // Собираем все доступные фото
  const allPhotos = useMemo(() => {
    if (loadedPhotos.length > 0) {
      return loadedPhotos;
    }
    // Fallback для обратной совместимости
    if (!place) return [];
    const photos: string[] = [];
    if (place.photo_urls && Array.isArray(place.photo_urls) && place.photo_urls.length > 0) {
      photos.push(...place.photo_urls.filter((url): url is string => typeof url === "string" && url.length > 0));
    } else if (place.cover_url) {
      photos.push(place.cover_url);
    }
    return photos;
  }, [loadedPhotos, place?.photo_urls, place?.cover_url]);

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
          .select("display_name, username")
          .eq("id", placeItem.created_by)
          .single();

        setCreatorProfile({
          display_name: profileData?.display_name ?? null,
          username: profileData?.username ?? null,
          email: null,
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
        // Only set error if we don't have comments yet
        if (comments.length === 0) {
          setCommentError("Failed to load comments. Please refresh the page.");
        }
      } else {
        // Загружаем профили пользователей для комментариев
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

        // Объединяем комментарии с профилями
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

  // Сбрасываем индекс фото при изменении места
  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [place?.id]);

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
        // Удаляем из избранного
        console.log("Removing favorite - place_id:", id, "user_id:", userId);
        
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error removing favorite - full error:", JSON.stringify(error, null, 2));
          const errorMessage = error.message || error.details || error.hint || JSON.stringify(error);
          alert("Failed to remove from favorites: " + errorMessage);
        } else {
          setIsFavorite(false);
          console.log("Removed from favorites");
        }
      } else {
        // Добавляем в избранное
        // Сначала проверяем, не существует ли уже запись
        const { data: existingData } = await supabase
          .from("reactions")
          .select("id")
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like")
          .maybeSingle();

        if (existingData) {
          // Запись уже существует, просто обновляем состояние
          console.log("Favorite already exists, updating state");
          setIsFavorite(true);
        } else {
          // Записи нет, создаем новую
          const insertData = {
            place_id: id,
            user_id: userId,
            reaction: "like",
          };
          
          console.log("Inserting favorite:", insertData);
          
          const { data, error } = await supabase
            .from("reactions")
            .insert(insertData)
            .select();

          if (error) {
            // Если ошибка о дублировании ключа, это означает что запись уже существует
            if (error.code === '23505' || error.message?.includes('duplicate key')) {
              console.log("Favorite already exists (race condition), updating state");
              setIsFavorite(true);
            } else {
              console.error("Error adding favorite - full error:", JSON.stringify(error, null, 2));
              console.error("Error code:", error.code);
              console.error("Error message:", error.message);
              console.error("Error details:", error.details);
              console.error("Error hint:", error.hint);
              
              const errorMessage = error.message || error.details || error.hint || JSON.stringify(error);
              alert("Failed to add to favorites: " + errorMessage);
            }
          } else {
            console.log("Successfully added to favorites:", data);
            setIsFavorite(true);
          }
        }
      }
    } catch (err) {
      console.error("Toggle favorite error:", err);
      alert("An error occurred. Please try again.");
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function addComment() {
    if (!commentText.trim() || !place) return;

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
        // Загружаем профиль пользователя для нового комментария
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
        .eq("user_id", userId); // Дополнительная проверка безопасности

      if (error) {
        console.error("Error deleting comment:", error);
        setCommentError("Failed to delete comment. Please try again.");
      } else {
        // Удаляем комментарий из списка
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (err) {
      console.error("Unexpected error deleting comment:", err);
      setCommentError("An unexpected error occurred while deleting.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  const hasMultiplePhotos = allPhotos.length > 1;
  const currentPhoto = allPhotos[currentPhotoIndex] || null;
  const creatorName = creatorProfile?.display_name || creatorProfile?.username || creatorProfile?.email?.split("@")[0] || "User";

  function nextPhoto() {
    if (allPhotos.length === 0) return;
    setCurrentPhotoIndex((prev) => (prev + 1) % allPhotos.length);
  }

  function prevPhoto() {
    if (allPhotos.length === 0) return;
    setCurrentPhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length);
  }

  // Минимальное расстояние для свайпа
  const minSwipeDistance = 50;

  function onTouchStart(e: React.TouchEvent) {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }

  function onTouchMove(e: React.TouchEvent) {
    setTouchEnd(e.targetTouches[0].clientX);
  }

  function onTouchEnd() {
    if (!touchStart || !touchEnd || allPhotos.length <= 1) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      nextPhoto();
    }
    if (isRightSwipe) {
      prevPhoto();
    }
  }

  if (!place) {
    return (
      <main className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="text-sm text-[#6b7d47]/60">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f7]">
      {/* Compact Media Header - 16:9, ~30-40% viewport */}
      <div className="relative mx-auto max-w-md" style={{ maxHeight: "min(40vh, 280px)" }}>
        {currentPhoto ? (
          <>
            {/* Minimal Header Controls */}
            <div className="absolute top-0 left-0 right-0 z-10">
              <div className="px-4 pt-safe-top pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleBack}
                    className="h-9 w-9 rounded-xl bg-white/95 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm"
                    aria-label="Back"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-2">
                    {userId && !isOwner && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite();
                        }}
                        disabled={favoriteLoading}
                        className={cx(
                          "h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm",
                          favoriteLoading && "opacity-50"
                        )}
                        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <svg
                          className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite();
                          }}
                          disabled={favoriteLoading}
                          className={cx(
                            "h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm",
                            favoriteLoading && "opacity-50"
                          )}
                          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          <svg
                            className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
                        <button
                          onClick={() => router.push(`/id/${id}/edit`)}
                          className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm"
                          aria-label="Edit"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Image Slider */}
            <div 
              className="w-full aspect-video bg-[#f5f4f2] overflow-hidden relative"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Images container with swipe support */}
              <div className="relative w-full h-full" style={{ touchAction: 'pan-y pinch-zoom' }}>
                {allPhotos.map((photo, index) => (
                  <div
                    key={index}
                    className={cx(
                      "absolute inset-0 transition-opacity duration-300",
                      index === currentPhotoIndex ? "opacity-100 z-0" : "opacity-0 z-0 pointer-events-none"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={`${place.title} - Photo ${index + 1}`}
                      className="w-full h-full object-cover select-none"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>

              {/* Navigation arrows - only show if multiple photos */}
              {hasMultiplePhotos && (
                <>
                  <button
                    onClick={prevPhoto}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm"
                    aria-label="Previous photo"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm"
                    aria-label="Next photo"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Photo indicator dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                    {allPhotos.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentPhotoIndex(index)}
                        className={cx(
                          "h-1.5 rounded-full transition-all",
                          index === currentPhotoIndex
                            ? "w-6 bg-white"
                            : "w-1.5 bg-white/50 hover:bg-white/75"
                        )}
                        aria-label={`Go to photo ${index + 1}`}
                      />
                    ))}
                  </div>

                  {/* Photo counter - в центре между кнопками */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 font-medium">
                    {currentPhotoIndex + 1} / {allPhotos.length}
                  </div>
                </>
              )}

              {/* Favorite button overlay */}
              {userId && !isOwner && (
                <div className="absolute top-2 right-2 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite();
                    }}
                    disabled={favoriteLoading}
                    className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm disabled:opacity-50"
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <svg
                      className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="w-full aspect-video bg-[#f5f4f2] flex items-center justify-center relative">
            {/* Header Controls */}
            <div className="absolute top-0 left-0 right-0 z-10">
              <div className="px-4 pt-safe-top pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleBack}
                    className="h-9 w-9 rounded-xl bg-white/95 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm"
                    aria-label="Back"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-2">
                    {userId && !isOwner && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite();
                        }}
                        disabled={favoriteLoading}
                        className={cx(
                          "h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm",
                          favoriteLoading && "opacity-50"
                        )}
                        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <svg
                          className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite();
                          }}
                          disabled={favoriteLoading}
                          className={cx(
                            "h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm",
                            favoriteLoading && "opacity-50"
                          )}
                          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          <svg
                            className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
                        <button
                          onClick={() => router.push(`/id/${id}/edit`)}
                          className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm"
                          aria-label="Edit"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Favorite button overlay for places without cover */}
            {userId && !isOwner && (
              <div className="absolute top-2 right-2 z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite();
                  }}
                  disabled={favoriteLoading}
                  className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm disabled:opacity-50"
                  title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="mx-auto max-w-md px-4 pb-20 pt-4">
        {/* Place Summary */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-[#2d2d2d] mb-1">{place.title}</h1>
              <div className="text-sm text-[#6b7d47]/70">
                {place.city ?? "—"}
                {place.country && `, ${place.country}`}
              </div>
            </div>
            {userId && !isOwner && !isFavorite && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFavorite();
                }}
                disabled={favoriteLoading}
                className="rounded-xl bg-[#6b7d47] text-white px-4 py-2 text-sm font-medium hover:bg-[#556036] transition active:scale-[0.98] flex-shrink-0"
              >
                Save
              </button>
            )}
          </div>

          {/* Vibe chips - 1-2 max */}
          {vibeChips.length > 0 && (
            <div className="flex gap-2 mt-3">
              {vibeChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full px-3 py-1 text-xs font-medium text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <Pill variant="tab" active={tab === "info"} onClick={() => setTab("info")}>
            Info
          </Pill>
          <Pill variant="tab" active={tab === "map"} onClick={() => setTab("map")}>
            Map
          </Pill>
          <Pill variant="tab" active={tab === "comments"} onClick={() => setTab("comments")}>
            Comments
          </Pill>
        </div>

        <div className="transition-opacity duration-200">
          {tab === "info" && (
            <div className="space-y-4">
              {/* Description */}
              {place.description && (
                <div className="text-sm text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                  {place.description}
                </div>
              )}

              {/* Category chips - clickable */}
              {categories.length > 0 && (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <Pill
                        key={cat}
                        onClick={() => router.push(`/?category=${encodeURIComponent(cat)}`)}
                      >
                        {cat}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              {/* External Link */}
              {place.link && (
                <div>
                  <a
                    href={place.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#6b7d47] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#556036] transition active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Visit Website
                  </a>
                </div>
              )}

              {/* Meta */}
              <div className="pt-3 border-t border-[#6b7d47]/10">
                <div className="text-xs text-[#6b7d47]/60">
                  Added by {creatorName} · {timeAgo(place.created_at)}
                </div>
              </div>
            </div>
          )}

          {tab === "map" && (
            <PlaceMapView place={place} />
          )}

          {tab === "comments" && (
            <div className="space-y-4">
              {/* Add comment CTA */}
              {userId ? (
                <div className="rounded-xl border border-[#6b7d47]/10 bg-white p-4">
                  <textarea
                    className="w-full bg-transparent text-sm outline-none text-[#2d2d2d] placeholder:text-[#6b7d47]/40 resize-none"
                    placeholder="Add a comment"
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
                    <div className="mt-2 text-xs text-red-600">
                      {commentError}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={addComment}
                      disabled={!commentText.trim() || sending}
                      className="rounded-xl bg-[#6b7d47] text-white px-4 py-2 text-sm font-medium hover:bg-[#556036] disabled:opacity-50 transition active:scale-[0.98]"
                    >
                      {sending ? "Posting…" : "Post"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[#6b7d47]/10 bg-white p-4 text-center">
                  <div className="text-sm text-[#6b7d47]/60 mb-2">Sign in to post comments</div>
                  <button
                    onClick={() => router.push("/auth")}
                    className="rounded-xl bg-[#6b7d47] text-white px-4 py-2 text-sm font-medium hover:bg-[#556036] transition active:scale-[0.98]"
                  >
                    Sign In
                  </button>
                </div>
              )}

              {/* Comments list - minimal */}
              {commentsLoading ? (
                <div className="text-center py-12 rounded-xl bg-white border border-[#6b7d47]/10">
                  <div className="text-sm text-[#6b7d47]/60">Loading comments…</div>
                </div>
              ) : comments.length === 0 && commentError && commentError.includes("Failed to load") ? (
                <div className="text-center py-12 rounded-xl bg-white border border-red-200 bg-red-50/50">
                  <div className="text-sm text-red-600 mb-2">{commentError}</div>
                  <button
                    onClick={() => {
                      setCommentError(null);
                      setCommentsLoading(true);
                      if (id) {
                        (async () => {
                          const { data: commentData, error: commentErr } = await supabase
                            .from("comments")
                            .select("id,text,created_at,user_id")
                            .eq("place_id", id)
                            .order("created_at", { ascending: false });

                          if (commentErr) {
                            console.error("Error loading comments:", commentErr);
                            setCommentError("Failed to load comments. Please refresh the page.");
                          } else {
                            setComments((commentData ?? []) as Comment[]);
                            setCommentError(null);
                          }
                          setCommentsLoading(false);
                        })();
                      }
                    }}
                    className="text-xs text-[#6b7d47] hover:text-[#556036] underline"
                  >
                    Try again
                  </button>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-white border border-[#6b7d47]/10">
                  <div className="text-sm text-[#6b7d47]/60 mb-1">No comments yet</div>
                  <div className="text-xs text-[#6b7d47]/50">Be the first to add context</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => {
                    const isMyComment = userId && c.user_id === userId;
                    const userName = c.user_display_name || c.user_username || "User";
                    const userAvatar = c.user_avatar_url;
                    const userInitials = initialsFromName(c.user_display_name, c.user_username);
                    
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-[#6b7d47]/10 bg-white p-4 relative"
                      >
                        <div className="flex items-start gap-3">
                          {/* Аватарка пользователя */}
                          <div className="flex-shrink-0">
                            {userAvatar ? (
                              <div className="w-10 h-10 rounded-full bg-[#f5f4f2] overflow-hidden border border-[#6b7d47]/10">
                                <img
                                  src={userAvatar}
                                  alt={userName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center border border-[#6b7d47]/10">
                                <span className="text-sm font-medium text-[#6b7d47]">
                                  {userInitials}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* Контент комментария */}
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
                                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition flex items-center gap-1 flex-shrink-0"
                                  title="Delete comment"
                                >
                                  {deletingCommentId === c.id ? (
                                    <>
                                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      Deleting...
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete
                                    </>
                                  )}
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
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Функция для создания круглого изображения
function createRoundIcon(imageUrl: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      
      // Создаем круглую обрезку
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.clip();
      
      // Рисуем изображение
      ctx.drawImage(img, 0, 0, size, size);
      
      // Добавляем белую обводку
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, 2 * Math.PI);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
      
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

function PlaceMapView({ place }: { place: Place }) {
  const [roundIcon, setRoundIcon] = useState<string | null>(null);
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["places"],
  });
  
  // Создаем круглую иконку для места
  useEffect(() => {
    if (place.cover_url && isLoaded) {
      createRoundIcon(place.cover_url, 40).then(setRoundIcon).catch(console.error);
    }
  }, [place.cover_url, isLoaded]);

  const center = useMemo(() => {
    if (place.lat && place.lng) {
      return { lat: place.lat, lng: place.lng };
    }
    return null;
  }, [place.lat, place.lng]);

  function openFullMap() {
    if (place.lat && place.lng) {
      window.open(`https://www.google.com/maps?q=${place.lat},${place.lng}`, "_blank");
    } else if (place.address) {
      window.open(`https://www.google.com/maps?q=${encodeURIComponent(place.address)}`, "_blank");
    }
  }

  if (!place.lat || !place.lng) {
    if (place.address) {
      return (
        <div className="space-y-3">
          <div className="text-sm text-[#6b7d47]/60 py-8 text-center rounded-xl bg-white border border-[#6b7d47]/10">
            Address available but no coordinates. Click below to view in Maps.
          </div>
          <button
            onClick={openFullMap}
            className="w-full rounded-xl bg-[#6b7d47] text-white px-4 py-3 text-sm font-medium hover:bg-[#556036] transition active:scale-[0.98]"
          >
            Open in Maps
          </button>
        </div>
      );
    }
    return (
      <div className="text-sm text-[#6b7d47]/60 py-8 text-center rounded-xl bg-white border border-[#6b7d47]/10">
        No location available
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-64 flex items-center justify-center rounded-xl bg-white border border-[#6b7d47]/10">
        <div className="text-sm text-[#6b7d47]/60">Loading map…</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-[#6b7d47]/10 bg-white">
        <div style={{ height: "64vh", minHeight: "400px", width: "100%" }}>
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center!}
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
            {typeof window !== "undefined" && (window as any).google?.maps && (() => {
              const coverUrl = place.cover_url;
              const iconSize = 40;
              
              const iconConfig = coverUrl && roundIcon ? {
                url: roundIcon,
                scaledSize: new (window as any).google.maps.Size(iconSize, iconSize),
                anchor: new (window as any).google.maps.Point(iconSize / 2, iconSize / 2),
              } : coverUrl ? {
                url: coverUrl,
                scaledSize: new (window as any).google.maps.Size(iconSize, iconSize),
                anchor: new (window as any).google.maps.Point(iconSize / 2, iconSize / 2),
              } : {
                path: (window as any).google.maps.SymbolPath?.CIRCLE,
                scale: 8,
                fillColor: "#556036",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              };

              return (
                <Marker
                  position={{ lat: place.lat, lng: place.lng }}
                  title={place.title}
                  icon={iconConfig}
                />
              );
            })()}
          </GoogleMap>
        </div>
      </div>
      <button
        onClick={openFullMap}
        className="w-full rounded-xl bg-[#6b7d47] text-white px-4 py-3 text-sm font-medium hover:bg-[#556036] transition active:scale-[0.98]"
      >
        Open in Maps
      </button>
    </div>
  );
}
