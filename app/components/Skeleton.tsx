"use client";

import { ReactNode } from "react";

// Base skeleton component with shimmer animation
export function SkeletonBase({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-[#ECEEE4] ${className}`}>
      {children || <div className="h-full w-full" />}
      <SkeletonShimmer />
    </div>
  );
}

// Shimmer effect for skeleton
export function SkeletonShimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
    </div>
  );
}

// PlaceCard skeleton - matches PlaceCard layout exactly
export function PlaceCardSkeleton() {
  return (
    <div className="w-full">
      {/* Image skeleton - preserves aspect ratio (75% padding-bottom) */}
      <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          <SkeletonBase className="h-full w-full rounded-2xl" />
        </div>
      </div>
      
      {/* Text content skeleton */}
      <div className="flex flex-col gap-1">
        {/* Title */}
        <div className="relative h-5 w-3/4 rounded mb-1 overflow-hidden">
          <SkeletonBase className="h-full w-full" />
        </div>
        {/* City */}
        <div className="relative h-4 w-1/2 rounded overflow-hidden">
          <SkeletonBase className="h-full w-full" />
        </div>
        {/* Tags */}
        <div className="flex gap-1.5 mt-0.5">
          <div className="relative h-5 w-16 rounded-full overflow-hidden">
            <SkeletonBase className="h-full w-full rounded-full" />
          </div>
          <div className="relative h-5 w-20 rounded-full overflow-hidden">
            <SkeletonBase className="h-full w-full rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// PlaceCard skeleton for carousel (fixed width)
export function PlaceCardCarouselSkeleton({ width = "220px" }: { width?: string }) {
  return (
    <div className="flex-shrink-0" style={{ width }}>
      <PlaceCardSkeleton />
    </div>
  );
}

// Grid of PlaceCard skeletons - preserves layout
export function PlaceCardGridSkeleton({ count = 6, columns = 2 }: { count?: number; columns?: number }) {
  // Use explicit grid classes to avoid Tailwind JIT issues
  const gridClass = columns === 2 ? 'grid-cols-2' : columns === 3 ? 'grid-cols-3' : 'grid-cols-1';
  return (
    <div className={`grid ${gridClass} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <PlaceCardSkeleton key={i} />
      ))}
    </div>
  );
}

// List skeleton for feed/activity - preserves layout height
export function ActivityItemSkeleton() {
  return (
    <div className="py-4 px-4 border-b border-[#6b7d47]/10">
      <div className="flex items-start gap-3">
        {/* Icon skeleton */}
        <div className="relative w-6 h-6 rounded-full flex-shrink-0 overflow-hidden">
          <SkeletonBase className="h-full w-full rounded-full" />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-2">
            <div className="relative h-4 w-32 rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
            <div className="relative h-3 w-20 rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
          </div>
          
          {/* Comment text skeleton (optional) */}
          <div className="relative h-10 w-full rounded-xl mb-3 overflow-hidden">
            <SkeletonBase className="h-full w-full rounded-xl" />
          </div>
          
          {/* Place preview skeleton */}
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden">
              <SkeletonBase className="h-full w-full rounded-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="relative h-4 w-3/4 rounded mb-1 overflow-hidden">
                <SkeletonBase className="h-full w-full" />
              </div>
              <div className="relative h-3 w-1/2 rounded overflow-hidden">
                <SkeletonBase className="h-full w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Page skeleton - full page loading - preserves layout height
export function PageSkeleton() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <div className="space-y-4">
          <div className="relative h-8 w-3/4 rounded mx-auto overflow-hidden">
            <SkeletonBase className="h-full w-full" />
          </div>
          <div className="relative h-4 w-1/2 rounded mx-auto overflow-hidden">
            <SkeletonBase className="h-full w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

// Map skeleton - preserves layout height to avoid CLS
export function MapSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`h-full w-full relative overflow-hidden ${className}`}>
      <SkeletonBase className="h-full w-full" />
      {/* Optional: subtle loading indicator */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-sm text-[#6F7A5A] opacity-60">Loading map…</div>
      </div>
    </div>
  );
}

// Profile skeleton - preserves layout height
export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero card skeleton */}
      <div className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
        <div className="flex items-start gap-6">
          {/* Avatar skeleton */}
          <div className="relative h-24 w-24 rounded-full flex-shrink-0 overflow-hidden">
            <SkeletonBase className="h-full w-full rounded-full" />
          </div>
          
          {/* Stats skeleton */}
          <div className="flex-1 space-y-2">
            <div className="relative h-4 w-24 rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
            <div className="relative h-4 w-32 rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
            <div className="relative h-6 w-40 rounded mt-4 overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Bio skeleton */}
      <div className="space-y-2">
        <div className="relative h-4 w-full rounded overflow-hidden">
          <SkeletonBase className="h-full w-full" />
        </div>
        <div className="relative h-4 w-5/6 rounded overflow-hidden">
          <SkeletonBase className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}

// Comments skeleton - preserves layout height
export function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {/* Avatar skeleton */}
          <div className="relative w-10 h-10 rounded-full flex-shrink-0 overflow-hidden">
            <SkeletonBase className="h-full w-full rounded-full" />
          </div>
          
          {/* Comment content skeleton */}
          <div className="flex-1 space-y-2">
            <div className="relative h-4 w-24 rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
            <div className="relative h-4 w-full rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
            <div className="relative h-4 w-3/4 rounded overflow-hidden">
              <SkeletonBase className="h-full w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Section header skeleton - preserves exact height
export function SectionHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-3 lg:mb-4 h-10 lg:h-12">
      <div className="relative h-6 w-32 rounded overflow-hidden">
        <SkeletonBase className="h-full w-full" />
      </div>
      <div className="relative h-8 w-8 rounded-full overflow-hidden">
        <SkeletonBase className="h-full w-full rounded-full" />
      </div>
    </div>
  );
}

// Home section skeleton (with carousel) - preserves exact layout
export function HomeSectionSkeleton({ isFirst = false }: { isFirst?: boolean }) {
  return (
    <div className={`mb-6 lg:mb-8 lg:mb-9 ${isFirst ? 'pt-6 lg:pt-8' : ''}`}>
      <SectionHeaderSkeleton />
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <PlaceCardCarouselSkeleton key={i} width="var(--home-card-width, 220px)" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Empty state component (for when there's no data, not loading)
export function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-12">
      <div className="text-sm text-[#6F7A5A]">{text}</div>
    </div>
  );
}
