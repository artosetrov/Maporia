"use client";

import Icon from "./Icon";

interface DesktopMosaicProps {
  photos: string[];
  title: string;
  gap?: number; // 8-16px
  radius?: number; // 16-22px
  onShowAll?: () => void;
  onPhotoClick?: (index: number) => void;
}

// Airbnb-style photo mosaic constants
const GALLERY_GAP = 12; // px
const GALLERY_RADIUS = 18; // px

export default function DesktopMosaic({
  photos,
  title,
  gap = GALLERY_GAP,
  radius = GALLERY_RADIUS,
  onShowAll,
  onPhotoClick,
}: DesktopMosaicProps) {
  // Airbnb-style photo mosaic
  // Layout: 2:1 aspect ratio container, 2 columns grid
  // Left: 1 hero image (1:1 aspect ratio)
  // Right: 2x2 grid (each photo 1:1 aspect ratio)
  // Height of entire block = width of left hero image

  if (photos.length === 0) {
    return (
      <div 
        className="w-full aspect-[2/1] flex items-center justify-center relative overflow-hidden" 
        style={{ 
          borderRadius: `${radius}px`,
          background: 'linear-gradient(135deg, #f5f4f2 0%, #e8e6e0 100%)',
        }}
      >
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="pattern-empty" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1.5" fill="#6b7d47" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#pattern-empty)" />
          </svg>
        </div>
        
        <div className="relative z-10 flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
            <svg className="w-8 h-8 text-[#A8B096]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-sm font-medium text-[#6F7A5A]">No photos available</div>
        </div>
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className="w-full aspect-[2/1] grid" style={{ gridTemplateColumns: '1fr 1fr', columnGap: `${gap}px` }}>
        <div className="relative overflow-hidden aspect-square" style={{ borderRadius: `${radius}px` }}>
          <img
            src={photos[0]}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="grid grid-cols-2 grid-rows-2" style={{ gap: `${gap}px` }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="relative overflow-hidden aspect-square flex items-center justify-center"
              style={{ 
                borderRadius: `${radius}px`,
                background: 'linear-gradient(135deg, #f5f4f2 0%, #e8e6e0 100%)',
              }}
            >
              {/* Decorative pattern */}
              <div className="absolute inset-0 opacity-5">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <pattern id={`pattern-single-${i}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                      <circle cx="10" cy="10" r="1.5" fill="#6b7d47" />
                    </pattern>
                  </defs>
                  <rect width="100" height="100" fill={`url(#pattern-single-${i})`} />
                </svg>
              </div>
              
              <div className="relative z-10 flex flex-col items-center justify-center gap-1">
                <Icon name="photo" size={20} className="text-[#A8B096]" strokeWidth={1.5} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const rightPhotos = photos.slice(1, 5); // Max 4 photos in right column

  return (
    <div
      className="w-full aspect-[2/1] grid"
      style={{
        gridTemplateColumns: '1fr 1fr',
        columnGap: `${gap}px`,
      }}
    >
      {/* Left: Hero image (1:1 aspect ratio) */}
      <button
        className="relative overflow-hidden aspect-square cursor-pointer"
        style={{ borderRadius: `${radius}px` }}
        onClick={() => onPhotoClick?.(0)}
      >
        <img
          src={photos[0]}
          alt={title}
          className="w-full h-full object-cover"
        />
      </button>

      {/* Right: 2x2 grid (each photo 1:1 aspect ratio) */}
      <div
        className="grid grid-cols-2 grid-rows-2 relative"
        style={{ gap: `${gap}px` }}
      >
        {rightPhotos.map((photo, index) => {
          const isBottomRight = index === 3; // Bottom-right tile (4th photo)
          const shouldShowButton = isBottomRight && photos.length > 5;
          const photoIndex = index + 1;
          return (
            <div
              key={index}
              className="relative overflow-hidden aspect-square"
              style={{ borderRadius: `${radius}px` }}
            >
              <button
                className="w-full h-full"
                onClick={() => onPhotoClick?.(photoIndex)}
              >
                <img
                  src={photo}
                  alt={`${title} - Photo ${index + 2}`}
                  className="w-full h-full object-cover"
                />
              </button>
              {shouldShowButton && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowAll?.();
                  }}
                  className="absolute bottom-3 right-3 bg-white hover:bg-[#FAFAF7] transition px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold text-[#1F2A1F] badge-shadow z-10"
                  style={{ bottom: `${gap}px`, right: `${gap}px` }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Show all {photos.length} photos
                </button>
              )}
            </div>
          );
        })}
        {/* Fill empty slots if less than 4 photos - Branded placeholder */}
        {rightPhotos.length < 4 && (
          <>
            {Array.from({ length: 4 - rightPhotos.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="relative overflow-hidden aspect-square flex items-center justify-center"
                style={{ 
                  borderRadius: `${radius}px`,
                  background: 'linear-gradient(135deg, #f5f4f2 0%, #e8e6e0 100%)',
                }}
              >
                {/* Decorative pattern */}
                <div className="absolute inset-0 opacity-5">
                  <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <pattern id={`pattern-${i}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                        <circle cx="10" cy="10" r="1.5" fill="#6b7d47" />
                      </pattern>
                    </defs>
                    <rect width="100" height="100" fill={`url(#pattern-${i})`} />
                  </svg>
                </div>
                
                {/* Icon and text */}
                <div className="relative z-10 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center">
                    <Icon name="photo" size={24} className="text-[#A8B096]" strokeWidth={1.5} />
                  </div>
                  <div className="text-xs font-medium text-[#6F7A5A]">
                    Photo {rightPhotos.length + i + 2}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
