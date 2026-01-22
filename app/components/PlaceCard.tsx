"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import PremiumBadge from "./PremiumBadge";
import LockedPlaceOverlay from "./LockedPlaceOverlay";
import Icon from "./Icon";

type PlaceCardProps = {
  place: {
    id: string;
    title: string;
    description?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    cover_url?: string | null;
    categories?: string[] | null;
    tags?: string[] | null;
    created_by?: string | null;
    accessLevel?: "public" | "premium"; // For draft places in wizard
    is_premium?: boolean | null; // TODO: Use when schema has this field
    premium_only?: boolean | null; // TODO: Use when schema has this field
    access_level?: string | null; // TODO: Use when schema has this field
  };
  userAccess?: UserAccess; // User's access level
  userId?: string | null; // Current user ID to check ownership
  favoriteButton?: ReactNode;
  isFavorite?: boolean; // Whether the place is in favorites (to show button always vs only on hover)
  hauntedGemIndex?: number; // Order index for Haunted Gem (1-based), if not provided, will use UUID-based method
  onClick?: () => void;
  onTagClick?: (tag: string) => void;
  onPhotoClick?: () => void;
  onRemoveFavorite?: (placeId: string, e: React.MouseEvent) => void;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

export default function PlaceCard({ place, userAccess, userId, favoriteButton, isFavorite = false, hauntedGemIndex, onClick, onTagClick, onPhotoClick, onRemoveFavorite }: PlaceCardProps) {
  const [creatorProfile, setCreatorProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    const userId = place.created_by;
    
    if (!userId) {
      if (loadedUserIdRef.current !== null) {
        setCreatorProfile(null);
        loadedUserIdRef.current = null;
      }
      return;
    }
    
    // Если уже загружен профиль для этого created_by, не загружаем повторно
    if (loadedUserIdRef.current === userId) return;
    
    // Если created_by изменился, сбрасываем профиль
    if (loadedUserIdRef.current !== null && loadedUserIdRef.current !== userId) {
      setCreatorProfile(null);
    }
    
    loadedUserIdRef.current = userId;
    
    let cancelled = false;
    
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", userId)
          .maybeSingle();
        
        if (error) {
          if (!cancelled) {
            console.error("Error loading creator profile:", error);
            loadedUserIdRef.current = null;
          }
          return;
        }
        
        if (!cancelled && data && loadedUserIdRef.current === userId) {
          setCreatorProfile({
            display_name: data.display_name,
            username: data.username,
            avatar_url: data.avatar_url,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Exception loading creator profile:", error);
          loadedUserIdRef.current = null;
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [place.created_by]);

  // Загружаем все фото места
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: photosData, error } = await supabase
          .from("place_photos")
          .select("url")
          .eq("place_id", place.id)
          .order("sort", { ascending: true });

        if (error) {
          // Only log meaningful errors (not empty objects)
          const hasErrorContent = error.message || error.code || error.details || error.hint;
          const hasKeys = typeof error === 'object' && error !== null && Object.keys(error).length > 0;
          
          if (hasErrorContent || (hasKeys && !(error.message === undefined && error.code === undefined))) {
            console.error("Error loading photos:", error);
          }
          // Fallback на cover_url
          if (place.cover_url && !cancelled) {
            setPhotos([place.cover_url]);
          } else if (!cancelled) {
            setPhotos([]);
          }
          return;
        }

        if (!cancelled) {
          if (photosData && photosData.length > 0) {
            const urls = photosData
              .map((p: any) => p.url)
              .filter((u: string | null): u is string => typeof u === "string" && u.length > 0);
            setPhotos(urls);
          } else if (place.cover_url) {
            // Fallback на cover_url если нет фото в place_photos
            setPhotos([place.cover_url]);
          } else {
            setPhotos([]);
          }
          setCurrentPhotoIndex(0);
        }
      } catch (error) {
        // Only log meaningful errors (not empty objects)
        if (error instanceof Error) {
          console.error("Exception loading photos:", error);
        } else if (typeof error === 'object' && error !== null) {
          const err = error as Record<string, unknown>;
          const hasErrorContent = err.message || err.code || err.details;
          const hasKeys = Object.keys(err).length > 0;
          if (hasErrorContent || (hasKeys && !(err.message === undefined && err.code === undefined))) {
            console.error("Exception loading photos:", error);
          }
        }
        if (!cancelled && place.cover_url) {
          setPhotos([place.cover_url]);
        } else if (!cancelled) {
          setPhotos([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [place.id, place.cover_url]);

  const creatorName = creatorProfile?.display_name || creatorProfile?.username || "Unknown";

  const handlePreviousPhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const handleDotClick = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPhotoIndex(index);
  };

  // Обработка свайпов на мобильных устройствах
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchEndX.current || !hasMultiplePhotos) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      // Swipe left - next photo
      e.preventDefault();
      e.stopPropagation();
      setCurrentPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
    } else if (distance < -minSwipeDistance) {
      // Swipe right - previous photo
      e.preventDefault();
      e.stopPropagation();
      setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const currentPhoto = photos[currentPhotoIndex] || place.cover_url;
  const hasMultiplePhotos = photos.length > 1;

  // Premium access checks using role system
  const defaultUserAccess: UserAccess = userAccess ?? { 
    role: "guest", 
    hasPremium: false, 
    isAdmin: false 
  };
  const isPremium = isPlacePremium(place);
  const canView = canUserViewPlace(defaultUserAccess, place);
  const isOwner = userId && place.created_by === userId;
  const isLocked = isPremium && !canView && !isOwner; // Owner always sees full content

  // Generate pseudo title for locked places (e.g., "Haunted Gem #1")
  const getPseudoPlaceNumber = (placeId: string): number => {
    // If hauntedGemIndex is provided, use it (1-based)
    if (hauntedGemIndex !== undefined && hauntedGemIndex !== null) {
      return hauntedGemIndex;
    }
    // Fallback: Convert UUID to a number by taking characters and converting to number
    // Use a consistent method to get a number between 1-9999
    const hash = placeId.replace(/-/g, '').substring(0, 8);
    const num = parseInt(hash, 16) % 9999;
    return num + 1; // Ensure it's between 1-9999
  };

  // For locked places, show "Haunted Gem #..." instead of real title
  const displayTitle = isLocked ? `Haunted Gem #${getPseudoPlaceNumber(place.id)}` : place.title;
  const pseudoTitle = isPremium ? `Haunted Gem #${getPseudoPlaceNumber(place.id)}` : null;

  const handlePhotoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow navigation if place is locked
    if (isLocked) {
      return;
    }
    
    if (onPhotoClick) {
      onPhotoClick();
    } else {
      // Default: navigate to place page
      window.location.href = `/id/${place.id}`;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent navigation if place is locked
    if (isLocked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (onClick) {
      onClick();
    }
  };

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onTagClick) {
      onTagClick(tag);
    }
  };

  return (
    <Link
      href={isLocked ? "#" : `/id/${place.id}`}
      onClick={handleCardClick}
      className={`block group relative w-full ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      {/* Photo with rounded corners */}
      <div 
        className="relative w-full flex-shrink-0 place-card-image mb-2" 
        style={{ paddingBottom: '75%' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {currentPhoto ? (
          <div
            onClick={handlePhotoClick}
            className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-[#FAFAF7] cursor-pointer"
          >
            <img
              src={currentPhoto}
              alt={displayTitle}
              className={cx(
                "absolute inset-0 w-full h-full object-cover",
                isLocked && !isOwner && "blur-md brightness-75"
              )}
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            />
            
            {/* Navigation arrows - показываем только если есть несколько фото */}
            {hasMultiplePhotos && (
              <>
                {/* Left arrow */}
                <button
                  onClick={handlePreviousPhoto}
                  className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-opacity duration-200 ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  aria-label="Previous photo"
                >
                  <svg className="w-4 h-4 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* Right arrow */}
                <button
                  onClick={handleNextPhoto}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-opacity duration-200 ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  aria-label="Next photo"
                >
                  <Icon name="forward" size={16} className="text-[#1F2A1F]" />
                </button>
              </>
            )}

            {/* Pagination dots - показываем только если есть несколько фото */}
            {hasMultiplePhotos && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                {photos.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => handleDotClick(e, index)}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      index === currentPhotoIndex
                        ? 'w-6 bg-white'
                        : 'w-1.5 bg-white/60 hover:bg-white/80'
                    }`}
                    aria-label={`Go to photo ${index + 1}`}
                  />
                ))}
              </div>
            )}

            {/* Premium badge - top left */}
            {isPremium && (
              <div className="absolute top-2 left-2 z-20">
                <PremiumBadge />
              </div>
            )}

            {/* Locked overlay - shown when user doesn't have premium access */}
            {isLocked && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-30 rounded-2xl">
                <div className="text-center p-4">
                  <PremiumBadge />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full rounded-2xl bg-[#FAFAF7] flex items-center justify-center">
            <svg className="w-12 h-12 text-[#A8B096]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {/* Favorite button - visible always if favorite, only on hover if not favorite */}
        {favoriteButton && (
          <div className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${
            isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}>
            {favoriteButton}
          </div>
        )}
        
        {/* Remove from favorites button - appears on hover (for saved page) */}
        {onRemoveFavorite && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemoveFavorite(place.id, e);
            }}
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm rounded-lg p-2 badge-shadow hover:bg-white z-10"
            aria-label="Remove from favorites"
          >
            <Icon name="heart" size={20} className="text-[#C96A5B]" filled active />
          </button>
        )}
      </div>

      {/* Text content - directly under photo, no container */}
      <div className="flex flex-col gap-1">
        {/* Title - Fraunces font - show "Haunted Gem #..." for locked places */}
        <div className="font-fraunces text-base font-semibold text-[#1F2A1F] line-clamp-1">{displayTitle}</div>

        {/* City - always show (even for locked places) */}
        {place.city && (
          <div className="text-sm text-[#6F7A5A] line-clamp-1">{place.city}</div>
        )}

        {/* Tags - hide for locked places */}
        {!isLocked && place.tags && place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {place.tags.slice(0, 3).map((tag, index) => (
              <button
                key={index}
                onClick={(e) => handleTagClick(e, tag)}
                className="text-xs text-[#6F7A5A] bg-[#FAFAF7] px-2 py-0.5 rounded-full hover:bg-[#ECEEE4] transition-colors"
              >
                #{tag}
              </button>
            ))}
            {place.tags.length > 3 && (
              <span className="text-xs text-[#A8B096] px-2 py-0.5">+{place.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
