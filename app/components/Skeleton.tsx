"use client";

import { ReactNode } from "react";

// Base skeleton component with shimmer animation (used internally)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SkeletonBase({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`animate-pulse ${className}`}>
      {children || <div className="bg-[#ECEEE4] rounded" />}
    </div>
  );
}

// Shimmer effect for skeleton
export function SkeletonShimmer() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

// PlaceCard skeleton - matches PlaceCard layout
export function PlaceCardSkeleton() {
  return (
    <div className="w-full">
      {/* Image skeleton */}
      <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
        <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] overflow-hidden">
          <SkeletonShimmer />
        </div>
      </div>
      
      {/* Text content skeleton */}
      <div className="flex flex-col gap-1">
        {/* Title */}
        <div className="h-5 w-3/4 bg-[#ECEEE4] rounded mb-1">
          <SkeletonShimmer />
        </div>
        {/* City */}
        <div className="h-4 w-1/2 bg-[#ECEEE4] rounded">
          <SkeletonShimmer />
        </div>
        {/* Tags */}
        <div className="flex gap-1.5 mt-0.5">
          <div className="h-5 w-16 bg-[#ECEEE4] rounded-full">
            <SkeletonShimmer />
          </div>
          <div className="h-5 w-20 bg-[#ECEEE4] rounded-full">
            <SkeletonShimmer />
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

// Grid of PlaceCard skeletons
export function PlaceCardGridSkeleton({ count = 6, columns = 2 }: { count?: number; columns?: number }) {
  return (
    <div className={`grid grid-cols-${columns} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <PlaceCardSkeleton key={i} />
      ))}
    </div>
  );
}

// List skeleton for feed/activity
export function ActivityItemSkeleton() {
  return (
    <div className="py-4 px-4 border-b border-[#6b7d47]/10">
      <div className="flex items-start gap-3">
        {/* Icon skeleton */}
        <div className="w-6 h-6 rounded-full bg-[#ECEEE4] flex-shrink-0">
          <SkeletonShimmer />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 w-32 bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
            <div className="h-3 w-20 bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
          </div>
          
          {/* Comment text skeleton (optional) */}
          <div className="h-10 w-full bg-[#ECEEE4] rounded-xl mb-3">
            <SkeletonShimmer />
          </div>
          
          {/* Place preview skeleton */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-[#ECEEE4] flex-shrink-0">
              <SkeletonShimmer />
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-4 w-3/4 bg-[#ECEEE4] rounded mb-1">
                <SkeletonShimmer />
              </div>
              <div className="h-3 w-1/2 bg-[#ECEEE4] rounded">
                <SkeletonShimmer />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Page skeleton - full page loading
export function PageSkeleton() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <div className="space-y-4">
          <div className="h-8 w-3/4 bg-[#ECEEE4] rounded mx-auto">
            <SkeletonShimmer />
          </div>
          <div className="h-4 w-1/2 bg-[#ECEEE4] rounded mx-auto">
            <SkeletonShimmer />
          </div>
        </div>
      </div>
    </main>
  );
}

// Map skeleton
export function MapSkeleton() {
  return (
    <div className="h-full w-full bg-[#ECEEE4] relative overflow-hidden">
      <SkeletonShimmer />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading map…</div>
      </div>
    </div>
  );
}

// Profile skeleton
export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero card skeleton */}
      <div className="bg-white border border-[#ECEEE4] rounded-2xl p-6">
        <div className="flex items-start gap-6">
          {/* Avatar skeleton */}
          <div className="h-24 w-24 rounded-full bg-[#ECEEE4] flex-shrink-0">
            <SkeletonShimmer />
          </div>
          
          {/* Stats skeleton */}
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
            <div className="h-4 w-32 bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
            <div className="h-6 w-40 bg-[#ECEEE4] rounded mt-4">
              <SkeletonShimmer />
            </div>
          </div>
        </div>
      </div>
      
      {/* Bio skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-full bg-[#ECEEE4] rounded">
          <SkeletonShimmer />
        </div>
        <div className="h-4 w-5/6 bg-[#ECEEE4] rounded">
          <SkeletonShimmer />
        </div>
      </div>
    </div>
  );
}

// Comments skeleton
export function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {/* Avatar skeleton */}
          <div className="w-10 h-10 rounded-full bg-[#ECEEE4] flex-shrink-0">
            <SkeletonShimmer />
          </div>
          
          {/* Comment content skeleton */}
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
            <div className="h-4 w-full bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
            <div className="h-4 w-3/4 bg-[#ECEEE4] rounded">
              <SkeletonShimmer />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Section header skeleton
export function SectionHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="h-6 w-32 bg-[#ECEEE4] rounded">
        <SkeletonShimmer />
      </div>
      <div className="h-8 w-8 rounded-full bg-[#ECEEE4]">
        <SkeletonShimmer />
      </div>
    </div>
  );
}

// Home section skeleton (with carousel)
export function HomeSectionSkeleton() {
  return (
    <div className="mb-6 lg:mb-8 lg:mb-9">
      <SectionHeaderSkeleton />
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <PlaceCardCarouselSkeleton key={i} />
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
