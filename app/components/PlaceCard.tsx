"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  };
  favoriteButton?: ReactNode;
  onClick?: () => void;
  onTagClick?: (tag: string) => void;
  onPhotoClick?: () => void;
};

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

export default function PlaceCard({ place, favoriteButton, onClick, onTagClick, onPhotoClick }: PlaceCardProps) {
  const [creatorProfile, setCreatorProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);

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
        const { data } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", userId)
          .single();
        
        if (!cancelled && data && loadedUserIdRef.current === userId) {
          setCreatorProfile({
            display_name: data.display_name,
            username: data.username,
            avatar_url: data.avatar_url,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading creator profile:", error);
          loadedUserIdRef.current = null;
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [place.created_by]);

  const creatorName = creatorProfile?.display_name || creatorProfile?.username || "Unknown";

  const handlePhotoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onPhotoClick) {
      onPhotoClick();
    } else {
      // Default: navigate to place page
      window.location.href = `/id/${place.id}`;
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
      href={`/id/${place.id}`}
      onClick={onClick}
      className="block cursor-pointer group relative"
    >
      <div className="flex gap-4 rounded-2xl bg-white border border-[#6b7d47]/10 overflow-hidden hover:border-[#6b7d47]/20 transition-all duration-200 h-32">
        {/* Left: Photo (4:3 aspect ratio) */}
        <div className="flex-shrink-0 w-32 md:w-40 h-full relative">
          {place.cover_url ? (
            <div
              onClick={handlePhotoClick}
              className="w-full h-full rounded-xl overflow-hidden bg-[#f5f4f2] cursor-pointer"
            >
              <img
                src={place.cover_url}
                alt={place.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            </div>
          ) : (
            <div className="w-full h-full rounded-xl bg-[#f5f4f2] flex items-center justify-center">
              <svg className="w-8 h-8 text-[#6b7d47]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Right: Content */}
        <div className="flex-1 min-w-0 py-3 pr-4 flex flex-col justify-between overflow-hidden">
          <div className="space-y-1.5 flex-1 min-h-0">
            {/* 1. Title */}
            <div className="text-base font-bold text-[#2d2d2d] line-clamp-1">{place.title}</div>

            {/* 2. Description (2 lines) */}
            {place.description && (
              <div className="text-sm text-[#6b7d47]/70 line-clamp-2">{place.description}</div>
            )}

            {/* 3. Creator (avatar + username) */}
            {creatorProfile && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#f5f4f2] overflow-hidden flex-shrink-0 border border-[#6b7d47]/10">
                  {creatorProfile.avatar_url ? (
                    <img
                      src={creatorProfile.avatar_url}
                      alt={creatorName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold text-[#6b7d47] flex items-center justify-center h-full">
                      {initialsFromName(creatorProfile.display_name || creatorProfile.username)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#6b7d47]/60">{creatorName}</span>
              </div>
            )}

            {/* 4. Address */}
            {place.address && (
              <div className="flex items-center gap-1.5 text-xs text-[#6b7d47]/50">
                <span>📍</span>
                <span className="truncate">{place.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Favorite button */}
        {favoriteButton && (
          <div className="absolute top-2 right-2 z-10">{favoriteButton}</div>
        )}
      </div>
    </Link>
  );
}
