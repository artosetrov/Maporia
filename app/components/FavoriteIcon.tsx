type FavoriteIconProps = {
  isActive?: boolean;
  size?: 16 | 20 | 24;
  className?: string;
};

/**
 * Unified favorite/bookmark icon component following Maporia brand guidelines
 * - Rounded, simple, no stroke (filled only)
 * - Active: Olive Green (#8F9E4F)
 * - Inactive: Muted (#A8B096)
 * - Sizes: 16 / 20 / 24
 */
export default function FavoriteIcon({ 
  isActive = false, 
  size = 20,
  className = "" 
}: FavoriteIconProps) {
  const sizeClass = size === 16 ? "w-4 h-4" : size === 20 ? "w-5 h-5" : "w-6 h-6";
  const colorClass = isActive ? "text-[#8F9E4F]" : "text-[#A8B096] opacity-40";
  
  return (
    <svg 
      className={`${sizeClass} ${colorClass} ${className}`}
      fill="currentColor" 
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}
