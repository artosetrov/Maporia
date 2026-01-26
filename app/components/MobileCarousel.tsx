"use client";

import { useState, useRef } from "react";
import Icon from "./Icon";

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
  onShowAll: _onShowAll,
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

  // Unused - kept for potential future use (keyboard navigation, etc.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _goToNext = () => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  if (photos.length === 0) {
    return (
      <div
        className="w-full bg-[#FAFAF7] flex items-center justify-center"
        style={{ height }}
      >
        <Icon name="photo" size={64} className="text-[#A8B096]" />
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
