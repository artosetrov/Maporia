"use client";

import { useState, useRef, useEffect } from "react";

interface MobileCarouselProps {
  photos: string[];
  title: string;
  height?: string; // e.g., "56vh"
  onShowAll?: () => void;
  onPhotoClick?: (index: number) => void;
}

export default function MobileCarousel({
  photos,
  title,
  height = "56vh",
  onShowAll,
  onPhotoClick,
}: MobileCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Minimum swipe distance
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  if (photos.length === 0) {
    return (
      <div
        className="w-full bg-[#f5f4f2] flex items-center justify-center"
        style={{ height }}
      >
        <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ height }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Images container */}
      <div
        className="flex transition-transform duration-300 ease-out h-full"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
        }}
      >
        {photos.map((photo, index) => (
          <div
            key={index}
            className="w-full h-full flex-shrink-0 relative"
          >
            <button
              onClick={() => onPhotoClick?.(index)}
              className="w-full h-full"
            >
              <img
                src={photo}
                alt={`${title} - Photo ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          </div>
        ))}
      </div>

      {/* Photo counter badge (e.g., "1/19") */}
      {photos.length > 1 && (
        <div className="absolute bottom-12 right-6 z-30 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 badge-shadow">
            <span className="text-white text-sm font-medium">
              {currentIndex + 1}/{photos.length}
            </span>
          </div>
        </div>
      )}

      {/* Pagination dots */}
      {photos.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {photos.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? 'w-6 bg-white'
                  : 'w-1.5 bg-white/60 hover:bg-white/80'
              }`}
              aria-label={`Go to photo ${index + 1}`}
            />
          ))}
        </div>
      )}

    </div>
  );
}
